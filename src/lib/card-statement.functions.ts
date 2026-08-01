import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Faturas de cartão: análise rigorosa via IA + persistência + revisão.
// ---------------------------------------------------------------------------

function extractJson(raw: string): any | null {
  if (!raw) return null;
  let s = raw
    .replace(/^\uFEFF/, "")
    .replace(/^\s*```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
  if (!s.startsWith("{") && !s.startsWith("[")) {
    const o = s.indexOf("{");
    const a = s.indexOf("[");
    const isArr = a !== -1 && (o === -1 || a < o);
    const start = isArr ? a : o;
    const end = isArr ? s.lastIndexOf("]") : s.lastIndexOf("}");
    if (start === -1 || end <= start) return null;
    s = s.slice(start, end + 1);
  }
  try {
    return JSON.parse(s);
  } catch {}
  try {
    return JSON.parse(
      s.replace(/,\s*}/g, "}").replace(/,\s*]/g, "]").replace(/[\x00-\x1F\x7F]/g, " "),
    );
  } catch {
    return null;
  }
}

function normalizeKey(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function seriesKey(cardId: string, description: string, amount: number, total?: number | null) {
  return `${cardId}:${normalizeKey(description).slice(0, 60)}:${amount.toFixed(2)}:${total ?? ""}`;
}

// ---- 1. Cria a fatura (pré-registro) --------------------------------------

export const createStatement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        cardId: z.string().uuid(),
        sourceFileName: z.string(),
        sourceHash: z.string(),
        sourceFilePath: z.string().optional(),
        pagesTotal: z.number().int().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Duplicidade: mesmo hash para o mesmo cartão.
    const { data: existing } = await supabase
      .from("card_statements")
      .select("id, status")
      .eq("user_id", userId)
      .eq("card_id", data.cardId)
      .eq("source_hash", data.sourceHash)
      .maybeSingle();
    if (existing) return { statementId: existing.id, duplicate: true };

    const { data: row, error } = await supabase
      .from("card_statements")
      .insert({
        user_id: userId,
        card_id: data.cardId,
        source_file_name: data.sourceFileName,
        source_file_path: data.sourceFilePath ?? null,
        source_hash: data.sourceHash,
        pages_total: data.pagesTotal ?? null,
        status: "processing",
        progress_stage: "Aguardando análise",
        progress_pct: 5,
      })
      .select("id")
      .single();
    if (error || !row) throw new Error(error?.message ?? "Falha ao criar fatura");
    return { statementId: row.id, duplicate: false };
  });

// ---- 2. Analisa o texto extraído da fatura --------------------------------

const AI_SYSTEM = "Você é um leitor especialista de faturas de cartão de crédito brasileiras. Responda APENAS com JSON válido, sem markdown, sem cercas de código.";

function buildPrompt(text: string, cardCtx: any, holders: any[]) {
  return [
    "Analise a fatura de cartão de crédito abaixo com o MÁXIMO RIGOR possível.",
    "Prioridade é PRECISÃO — não pule linhas, não invente valores.",
    "",
    "REGRAS OBRIGATÓRIAS:",
    "1. Leia TODAS as páginas e TODAS as linhas de lançamentos. Não resuma.",
    "2. Valores no padrão brasileiro: vírgula = decimal, ponto = milhar. 'R$ 1.880,00' = 1880.00. NUNCA divida por 100.",
    "3. amount é sempre POSITIVO. Use kind para dizer a natureza:",
    "   'compra' | 'tarifa' | 'anuidade' | 'juros' | 'encargo' | 'seguro' | 'saque' | 'pagamento' | 'estorno' | 'credito' | 'ajuste' | 'assinatura' | 'cancelada' | 'iof' | 'outros'.",
    "4. Parcela: se o texto disser '03/10' ou 'PARC 03 DE 10', preencha installment_current=3, installment_total=10.",
    "   NÃO multiplique o valor da parcela pelo total — o amount é o valor da PARCELA ATUAL, não da compra inteira.",
    "5. Se a fatura tiver seções por titular/cartão adicional ('Cartão final 7731 - Vina'), associe cada lançamento ao titular/last4 correspondente.",
    "6. Marque low_confidence=true em linhas ilegíveis ou incertas — NÃO descarte.",
    "7. Se houver dúvida sobre moeda, use 'BRL'. Compras internacionais podem ter moeda diferente + país/cidade.",
    "8. Pagamento da fatura ('PAGAMENTO EFETUADO', 'PGTO NORMAL', 'PAGTO DEBITO CONTA') deve ir com kind='pagamento'.",
    "9. Estornos e créditos podem ter valor com sinal negativo no documento — devolva amount positivo e kind='estorno' ou 'credito'.",
    "",
    `Contexto do cartão cadastrado: ${JSON.stringify({
      name: cardCtx?.name,
      brand: cardCtx?.brand,
      last4: cardCtx?.last4,
      holder: cardCtx?.holder,
    })}`,
    `Titulares/adicionais cadastrados: ${JSON.stringify(holders.map((h) => ({ name: h.holder_name, last4: h.last4 })))}`,
    "",
    "Texto da fatura (todas as páginas):",
    text.slice(0, 180_000),
    "",
    "Formato de resposta:",
    "{",
    '  "statement": {',
    '    "bank_name": string|null,',
    '    "period_start": "YYYY-MM-DD"|null,',
    '    "period_end": "YYYY-MM-DD"|null,',
    '    "closing_date": "YYYY-MM-DD"|null,',
    '    "due_date": "YYYY-MM-DD"|null,',
    '    "total_amount": number|null,',
    '    "minimum_payment": number|null,',
    '    "detected_cards": [ { "holder_name": string|null, "last4": string|null } ]',
    "  },",
    '  "transactions": [',
    "    {",
    '      "txn_date": "YYYY-MM-DD"|null,',
    '      "description": string,',
    '      "amount": number,',
    '      "currency": string,',
    '      "country": string|null,',
    '      "installment_current": number|null,',
    '      "installment_total": number|null,',
    '      "last4": string|null,',
    '      "holder_name": string|null,',
    '      "category": string|null,',
    '      "kind": string,',
    '      "confidence": number,',
    '      "low_confidence": boolean,',
    '      "notes": string|null',
    "    }",
    "  ]",
    "}",
  ].join("\n");
}

export const analyzeStatement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        statementId: z.string().uuid(),
        text: z.string().min(20),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("LOVABLE_API_KEY ausente");

    const { data: stmt } = await supabase
      .from("card_statements")
      .select("*, cards(*)")
      .eq("id", data.statementId)
      .eq("user_id", userId)
      .single();
    if (!stmt) throw new Error("Fatura não encontrada");

    const card = (stmt as any).cards;
    const { data: holders } = await supabase
      .from("card_holders")
      .select("id, holder_name, last4")
      .eq("card_id", stmt.card_id);

    await supabase
      .from("card_statements")
      .update({ progress_stage: "Analisando lançamentos com IA", progress_pct: 40 })
      .eq("id", stmt.id);

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: AI_SYSTEM },
          { role: "user", content: buildPrompt(data.text, card, holders ?? []) },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      await supabase
        .from("card_statements")
        .update({ status: "error", error: `Gateway ${res.status}: ${body.slice(0, 300)}` })
        .eq("id", stmt.id);
      throw new Error(`Gateway ${res.status}: ${body.slice(0, 300)}`);
    }

    const raw = await res.json();
    const content: string = raw?.choices?.[0]?.message?.content ?? "";
    const parsed = extractJson(content) as { statement?: any; transactions?: any[] } | null;
    if (!parsed) {
      await supabase
        .from("card_statements")
        .update({ status: "error", error: `JSON inválido: ${content.slice(0, 200)}` })
        .eq("id", stmt.id);
      throw new Error("JSON inválido do modelo");
    }

    await supabase
      .from("card_statements")
      .update({ progress_stage: "Verificando parcelas e duplicidades", progress_pct: 75 })
      .eq("id", stmt.id);

    // Atualiza metadados da fatura
    const s = parsed.statement ?? {};
    await supabase
      .from("card_statements")
      .update({
        bank_name: s.bank_name ?? null,
        period_start: s.period_start ?? null,
        period_end: s.period_end ?? null,
        closing_date: s.closing_date ?? null,
        due_date: s.due_date ?? null,
        total_amount: s.total_amount ?? null,
        minimum_payment: s.minimum_payment ?? null,
        raw_analysis: parsed as any,
      })
      .eq("id", stmt.id);

    // Carrega histórico de séries desse cartão para não recriar parcelas.
    const { data: existingSeries } = await supabase
      .from("card_transactions")
      .select("original_series_id, installment_current")
      .eq("card_id", stmt.card_id)
      .not("original_series_id", "is", null);
    const existingKeys = new Set(
      (existingSeries ?? []).map(
        (r) => `${r.original_series_id}#${r.installment_current ?? ""}`,
      ),
    );

    const txs = Array.isArray(parsed.transactions) ? parsed.transactions : [];
    const holdersByLast4 = new Map<string, string>();
    const holdersByName = new Map<string, string>();
    for (const h of holders ?? []) {
      if (h.last4) holdersByLast4.set(String(h.last4), h.id);
      if (h.holder_name) holdersByName.set(normalizeKey(h.holder_name), h.id);
    }

    const toInsert: any[] = [];
    let dupCount = 0;
    for (const t of txs) {
      const amount = Number(t.amount);
      if (!Number.isFinite(amount)) continue;
      const description = String(t.description ?? "").trim();
      if (!description) continue;
      const kind = String(t.kind ?? "compra");
      const holder_id =
        (t.last4 && holdersByLast4.get(String(t.last4))) ||
        (t.holder_name && holdersByName.get(normalizeKey(String(t.holder_name)))) ||
        null;

      const series = seriesKey(stmt.card_id, description, amount, t.installment_total ?? null);
      const dedupKey = `${series}#${t.installment_current ?? ""}`;
      const isDup = existingKeys.has(dedupKey);
      if (isDup) dupCount += 1;

      toInsert.push({
        user_id: userId,
        statement_id: stmt.id,
        card_id: stmt.card_id,
        card_holder_id: holder_id,
        txn_date: t.txn_date ?? null,
        description,
        amount: Math.abs(amount),
        currency: t.currency ?? "BRL",
        country: t.country ?? null,
        installment_current: t.installment_current ?? null,
        installment_total: t.installment_total ?? null,
        last4: t.last4 ? String(t.last4) : null,
        holder_name: t.holder_name ?? null,
        category: t.category ?? null,
        kind,
        confidence: typeof t.confidence === "number" ? t.confidence : null,
        low_confidence: Boolean(t.low_confidence),
        status: isDup ? "duplicate" : "pending",
        original_series_id: series,
        notes: t.notes ?? null,
        raw: t as any,
      });
    }

    if (toInsert.length) {
      // Insere em blocos de 500 para evitar payloads gigantes
      for (let i = 0; i < toInsert.length; i += 500) {
        const slice = toInsert.slice(i, i + 500);
        const { error } = await supabase.from("card_transactions").insert(slice);
        if (error) throw new Error(error.message);
      }
    }

    await supabase
      .from("card_statements")
      .update({
        status: "review",
        progress_stage: "Pronto para conferência",
        progress_pct: 100,
      })
      .eq("id", stmt.id);

    return { transactions: toInsert.length, duplicates: dupCount };
  });

// ---- 3. Aprovação em lote / individual ------------------------------------

export const setTransactionStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        ids: z.array(z.string().uuid()).min(1),
        status: z.enum(["approved", "rejected", "later", "pending"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("card_transactions")
      .update({ status: data.status })
      .in("id", data.ids)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { updated: data.ids.length };
  });

export const updateTransaction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        patch: z.record(z.string(), z.any()),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const allowed = [
      "txn_date",
      "description",
      "amount",
      "category",
      "kind",
      "card_holder_id",
      "property_id",
      "profile_id",
      "notes",
      "installment_current",
      "installment_total",
    ];
    const clean: any = {};
    for (const k of allowed) if (k in data.patch) clean[k] = data.patch[k];
    const { error } = await supabase
      .from("card_transactions")
      .update(clean)
      .eq("id", data.id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const addManualTransaction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        statementId: z.string().uuid(),
        txn: z.object({
          txn_date: z.string().nullable().optional(),
          description: z.string().min(1),
          amount: z.number(),
          card_holder_id: z.string().uuid().nullable().optional(),
          installment_current: z.number().nullable().optional(),
          installment_total: z.number().nullable().optional(),
          category: z.string().nullable().optional(),
          kind: z.string().default("compra"),
          property_id: z.string().uuid().nullable().optional(),
          notes: z.string().nullable().optional(),
        }),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: stmt } = await supabase
      .from("card_statements")
      .select("card_id")
      .eq("id", data.statementId)
      .eq("user_id", userId)
      .single();
    if (!stmt) throw new Error("Fatura não encontrada");
    const { error } = await supabase.from("card_transactions").insert({
      ...data.txn,
      user_id: userId,
      statement_id: data.statementId,
      card_id: stmt.card_id,
      amount: Math.abs(data.txn.amount),
      status: "approved",
      confidence: 1,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const finalizeStatement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ statementId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    // Transação única no banco: pendentes viram "verificar depois" e a fatura fecha.
    const { data: res, error } = await supabase.rpc("finalize_card_statement_rpc", {
      p_statement_id: data.statementId,
    });
    if (error) throw new Error(error.message);
    const state = Array.isArray(res) ? res[0] : res;
    if (state?.statement_status !== "approved") {
      throw new Error("A finalização da fatura não foi confirmada pelo banco de dados.");
    }
    return {
      ok: true as const,
      approved: Number(state.approved_count ?? 0),
      later: Number(state.later_count ?? 0),
    };
  });