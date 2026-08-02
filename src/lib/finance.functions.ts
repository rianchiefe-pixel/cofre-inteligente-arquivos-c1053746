import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Razão financeiro unificado.
 *
 * Regra anti-dupla-contagem (determinística):
 * - Compras do cartão vêm de `card_transactions` (aprovadas).
 * - O pagamento da fatura aparece em `receipts` com `card_id` preenchido.
 *   Quando o razão inclui as compras do cartão, esses pagamentos são
 *   marcados como `excluded_double_count` e não entram no total, porque o
 *   valor já está representado lançamento a lançamento.
 * - Estornos e créditos entram com sinal negativo; "pagamento" dentro da
 *   fatura é apenas movimentação interna e nunca soma no total.
 */
export type LedgerSource = "receipt" | "card";

export interface LedgerEntry {
  id: string;
  source: LedgerSource;
  date: string | null;
  amount: number;
  signed_amount: number;
  description: string | null;
  counterparty: string | null;
  bank_name: string | null;
  category: string | null;
  kind: string | null;
  profile_id: string | null;
  property_id: string | null;
  card_id: string | null;
  counted: boolean;
  excluded_reason: string | null;
}

const CREDIT_KINDS = new Set(["estorno", "credito"]);
const INTERNAL_KINDS = new Set(["pagamento", "cancelada"]);

/** Página do PostgREST: leitura completa exige paginar, não usar limit fixo. */
const PAGE_SIZE = 1000;

async function fetchAllPages<T>(
  build: (fromRow: number, toRow: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  maxRows: number,
): Promise<T[]> {
  const out: T[] = [];
  for (let offset = 0; offset < maxRows; offset += PAGE_SIZE) {
    const end = Math.min(offset + PAGE_SIZE, maxRows) - 1;
    const { data, error } = await build(offset, end);
    if (error) throw new Error(error.message);
    const page = data ?? [];
    out.push(...page);
    if (page.length < end - offset + 1) break;
  }
  return out;
}

export const getUnifiedLedger = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        from: z.string().optional(),
        to: z.string().optional(),
        profileId: z.string().uuid().nullable().optional(),
        propertyId: z.string().uuid().nullable().optional(),
        includeCards: z.boolean().default(true),
        /** Teto de segurança da leitura paginada (não é limite de página). */
        maxRows: z.number().int().min(1).max(100000).default(50000),
      })
      .strict()
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const receipts = await fetchAllPages<any>((start, end) => {
      let rq = supabase
        .from("receipts")
        .select(
          "id, payment_date, amount, description, recipient_name, bank_name, transaction_type, profile_id, property_id, card_id, categories(name)",
        )
        .eq("status", "approved")
        .order("payment_date", { ascending: false })
        .order("id", { ascending: true })
        .range(start, end);
      if (data.from) rq = rq.gte("payment_date", data.from);
      if (data.to) rq = rq.lte("payment_date", data.to);
      if (data.profileId) rq = rq.eq("profile_id", data.profileId);
      if (data.propertyId) rq = rq.eq("property_id", data.propertyId);
      return rq as any;
    }, data.maxRows);

    let cardRows: any[] = [];
    if (data.includeCards) {
      cardRows = await fetchAllPages<any>((start, end) => {
        let cq = supabase
          .from("card_transactions")
          .select(
            "id, txn_date, amount, description, category, kind, profile_id, property_id, card_id, status",
          )
          .eq("status", "approved")
          .order("txn_date", { ascending: false })
          .order("id", { ascending: true })
          .range(start, end);
        if (data.from) cq = cq.gte("txn_date", data.from);
        if (data.to) cq = cq.lte("txn_date", data.to);
        if (data.profileId) cq = cq.eq("profile_id", data.profileId);
        if (data.propertyId) cq = cq.eq("property_id", data.propertyId);
        return cq as any;
      }, data.maxRows);
    }

    const entries: LedgerEntry[] = [];

    for (const r of receipts ?? []) {
      const isCardBillPayment = Boolean(r.card_id) && data.includeCards;
      const amount = Number(r.amount ?? 0);
      entries.push({
        id: r.id,
        source: "receipt",
        date: r.payment_date,
        amount,
        signed_amount: isCardBillPayment ? 0 : amount,
        description: r.description,
        counterparty: r.recipient_name,
        bank_name: r.bank_name,
        category: (r as any).categories?.name ?? null,
        kind: r.transaction_type,
        profile_id: r.profile_id,
        property_id: r.property_id,
        card_id: r.card_id,
        counted: !isCardBillPayment,
        excluded_reason: isCardBillPayment
          ? "Pagamento de fatura: valor já detalhado nos lançamentos do cartão"
          : null,
      });
    }

    for (const t of cardRows) {
      const amount = Number(t.amount ?? 0);
      const kind = (t.kind ?? "compra") as string;
      const internal = INTERNAL_KINDS.has(kind);
      const credit = CREDIT_KINDS.has(kind);
      entries.push({
        id: t.id,
        source: "card",
        date: t.txn_date,
        amount,
        signed_amount: internal ? 0 : credit ? -amount : amount,
        description: t.description,
        counterparty: t.description,
        bank_name: null,
        category: t.category,
        kind,
        profile_id: t.profile_id,
        property_id: t.property_id,
        card_id: t.card_id,
        counted: !internal,
        excluded_reason: internal
          ? "Movimentação interna da fatura (pagamento/cancelamento)"
          : null,
      });
    }

    entries.sort((a, b) => String(b.date ?? "").localeCompare(String(a.date ?? "")));

    const total = entries.reduce((s, e) => s + e.signed_amount, 0);
    const receiptTotal = entries
      .filter((e) => e.source === "receipt")
      .reduce((s, e) => s + e.signed_amount, 0);
    const cardTotal = entries
      .filter((e) => e.source === "card")
      .reduce((s, e) => s + e.signed_amount, 0);

    /**
     * Regra explícita: investimento NÃO entra em "gasto do mês".
     * `spend` = tudo que é despesa/gasto; `invested` = aportes.
     */
    const INVEST_KINDS = new Set(["investimento", "patrimonial"]);
    const invested = entries
      .filter((e) => e.counted && INVEST_KINDS.has(String(e.kind ?? "")))
      .reduce((s, e) => s + e.signed_amount, 0);
    const spend = total - invested;

    return {
      entries,
      totals: {
        total,
        spend,
        invested,
        receipts: receiptTotal,
        cards: cardTotal,
        excluded: entries.filter((e) => !e.counted).length,
        count: entries.length,
      },
    };
  });