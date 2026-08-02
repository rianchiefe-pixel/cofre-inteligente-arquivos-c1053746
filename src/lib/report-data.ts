import { supabase } from "@/integrations/supabase/client";

export const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

export const UNCATEGORIZED = "Sem categoria definida";

export type ReportKindKey = "despesa" | "investimento";

export interface LedgerEntry {
  id: string;
  date: string;
  amount: number;
  kind: ReportKindKey;
  fixed: boolean;
  variable: boolean;
  category: string;
  subcategory: string;
  hasCategory: boolean;
  payee: string;
  account: string;
  rawCategory: string;
  notes: string;
}

export interface CategoryRow { name: string; value: number; pct: number }
export interface MemoryRow { category: string; subcategory: string; qty: number; value: number; pctCategory: number; pctKind: number }

export interface KindBlock {
  total: number;
  categories: CategoryRow[];
  memory: MemoryRow[];
  uncategorized: LedgerEntry[];
}

export interface MonthBlock {
  key: string;
  label: string;
  year: number;
  despesas: number;
  investimentos: number;
  total: number;
  fixed: number;
  variable: number;
  fixedCategories: CategoryRow[];
  variableCategories: CategoryRow[];
  despesaBlock: KindBlock;
  investimentoBlock: KindBlock;
}

export interface ReportDataset {
  from: string;
  to: string;
  periodLabel: string;
  months: MonthBlock[];
  totals: { despesas: number; investimentos: number; total: number; fixed: number; variable: number };
  entries: LedgerEntry[];
}

interface Filters {
  from: string;
  to: string;
  profileId?: string | null;
  propertyId?: string | null;
}

const isInvestment = (t: string | null) => t === "investimento" || t === "patrimonial";

function pct(part: number, whole: number) {
  return whole > 0 ? (part / whole) * 100 : 0;
}

function groupCategories(entries: LedgerEntry[]): CategoryRow[] {
  const total = entries.reduce((s, e) => s + e.amount, 0);
  const map = new Map<string, number>();
  for (const e of entries) map.set(e.category, (map.get(e.category) ?? 0) + e.amount);
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, value]) => ({ name, value, pct: pct(value, total) }));
}

function buildMemory(entries: LedgerEntry[]): MemoryRow[] {
  const total = entries.reduce((s, e) => s + e.amount, 0);
  const catTotals = new Map<string, number>();
  for (const e of entries) catTotals.set(e.category, (catTotals.get(e.category) ?? 0) + e.amount);
  const map = new Map<string, MemoryRow>();
  for (const e of entries) {
    const k = `${e.category}||${e.subcategory}`;
    const cur = map.get(k) ?? { category: e.category, subcategory: e.subcategory, qty: 0, value: 0, pctCategory: 0, pctKind: 0 };
    cur.qty += 1;
    cur.value += e.amount;
    map.set(k, cur);
  }
  return [...map.values()]
    .map((r) => ({ ...r, pctCategory: pct(r.value, catTotals.get(r.category) ?? 0), pctKind: pct(r.value, total) }))
    .sort((a, b) => a.category.localeCompare(b.category, "pt-BR") || b.value - a.value);
}

function buildKindBlock(entries: LedgerEntry[]): KindBlock {
  return {
    total: entries.reduce((s, e) => s + e.amount, 0),
    categories: groupCategories(entries),
    memory: buildMemory(entries),
    uncategorized: entries.filter((e) => !e.hasCategory),
  };
}

/** Carrega comprovantes aprovados e monta a estrutura mensal usada pelos relatórios. */
export async function loadReportDataset(f: Filters): Promise<ReportDataset> {
  const { data: cats } = await supabase.from("categories").select("id, name, parent_id");
  const catById = new Map((cats ?? []).map((c) => [c.id, c]));

  const PAGE = 1000;
  const rows: any[] = [];
  for (let offset = 0; offset < 100000; offset += PAGE) {
    let q = supabase
      .from("receipts")
      .select("id, payment_date, amount, transaction_type, category_id, recipient_name, bank_name, description, notes, payment_method, profile_id, property_id")
      .eq("status", "approved")
      .order("payment_date", { ascending: true })
      .order("id", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (f.from) q = q.gte("payment_date", f.from);
    if (f.to) q = q.lte("payment_date", f.to);
    if (f.profileId) q = q.eq("profile_id", f.profileId);
    if (f.propertyId) q = q.eq("property_id", f.propertyId);
    const { data, error } = await q;
    if (error) throw error;
    const page = data ?? [];
    rows.push(...page);
    if (page.length < PAGE) break;
  }

  const entries: LedgerEntry[] = rows
    .filter((r) => r.payment_date)
    .map((r) => {
      const cat = r.category_id ? catById.get(r.category_id) : null;
      const parent = cat?.parent_id ? catById.get(cat.parent_id) : null;
      const category = parent?.name ?? cat?.name ?? UNCATEGORIZED;
      const subcategory = cat?.name ?? "Não identificado";
      const t = r.transaction_type as string | null;
      return {
        id: r.id,
        date: String(r.payment_date).slice(0, 10),
        amount: Math.abs(Number(r.amount ?? 0)),
        kind: isInvestment(t) ? "investimento" : "despesa",
        fixed: t === "gasto_fixo",
        variable: t === "gasto_variavel",
        category,
        subcategory,
        hasCategory: Boolean(cat),
        payee: r.recipient_name ?? "—",
        account: isInvestment(t) ? "INVESTIMENTOS" : "DESPESAS",
        rawCategory: cat?.name ?? "Não identificado",
        notes: [r.description, r.notes].filter(Boolean).join("; "),
      } satisfies LedgerEntry;
    });

  const monthKeys = [...new Set(entries.map((e) => e.date.slice(0, 7)))].sort();
  const months: MonthBlock[] = monthKeys.map((key) => {
    const list = entries.filter((e) => e.date.startsWith(key));
    const desp = list.filter((e) => e.kind === "despesa");
    const inv = list.filter((e) => e.kind === "investimento");
    const fixedList = list.filter((e) => e.fixed);
    const varList = list.filter((e) => e.variable);
    const [y, m] = key.split("-");
    const sum = (l: LedgerEntry[]) => l.reduce((s, e) => s + e.amount, 0);
    return {
      key,
      label: MONTH_NAMES[Number(m) - 1],
      year: Number(y),
      despesas: sum(desp),
      investimentos: sum(inv),
      total: sum(list),
      fixed: sum(fixedList),
      variable: sum(varList),
      fixedCategories: groupCategories(fixedList),
      variableCategories: groupCategories(varList),
      despesaBlock: buildKindBlock(desp),
      investimentoBlock: buildKindBlock(inv),
    };
  });

  const totals = {
    despesas: months.reduce((s, m) => s + m.despesas, 0),
    investimentos: months.reduce((s, m) => s + m.investimentos, 0),
    total: months.reduce((s, m) => s + m.total, 0),
    fixed: months.reduce((s, m) => s + m.fixed, 0),
    variable: months.reduce((s, m) => s + m.variable, 0),
  };

  const first = months[0];
  const last = months[months.length - 1];
  const periodLabel = first
    ? first.key === last.key
      ? `${first.label.toLowerCase()} de ${first.year}`
      : `${first.label.toLowerCase()} a ${last.label.toLowerCase()} de ${last.year}`
    : "período sem lançamentos";

  return { from: f.from, to: f.to, periodLabel, months, totals, entries };
}
