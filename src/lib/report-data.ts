import { supabase } from "@/integrations/supabase/client";

export const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

export const UNCATEGORIZED = "Sem categoria definida";
export const UNCLASSIFIED_LABEL = "Não classificado";

export type ReportKindKey = "despesa" | "investimento";
/** Classificação de gasto. Só se aplica a despesas — investimento nunca é fixo/variável. */
export type SpendClass = "fixed" | "variable" | "unclassified";
/** Origem da classificação, na ordem de prioridade oficial. */
export type ClassSource = "entry" | "category" | "none";

export interface LedgerEntry {
  id: string;
  date: string;
  /** Valor em centavos inteiros — única fonte usada em somas. */
  cents: number;
  /** Espelho decimal (centavos/100) apenas para exibição. */
  amount: number;
  kind: ReportKindKey;
  spendClass: SpendClass;
  classSource: ClassSource;
  fixed: boolean;
  variable: boolean;
  category: string;
  subcategory: string;
  hasCategory: boolean;
  payee: string;
  account: string;
  rawCategory: string;
  notes: string;
  transactionType: string | null;
  categoryDefaultType: string | null;
}

export interface CategoryRow { name: string; value: number; cents: number; pct: number }
export interface MemoryRow { category: string; subcategory: string; qty: number; value: number; cents: number; pctCategory: number; pctKind: number }

export interface KindBlock {
  total: number;
  totalCents: number;
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
  unclassified: number;
  despesasCents: number;
  investimentosCents: number;
  totalCents: number;
  fixedCents: number;
  variableCents: number;
  unclassifiedCents: number;
  fixedCategories: CategoryRow[];
  variableCategories: CategoryRow[];
  unclassifiedCategories: CategoryRow[];
  unclassifiedEntries: LedgerEntry[];
  despesaBlock: KindBlock;
  investimentoBlock: KindBlock;
  entries: LedgerEntry[];
}

export interface DuplicateGroup {
  key: string;
  date: string;
  payee: string;
  cents: number;
  ids: string[];
}

export interface ClassConflict {
  category: string;
  fixedCents: number;
  variableCents: number;
  explicit: boolean;
}

export interface ReportDiagnostics {
  /** Grupos suspeitos (mesma data/valor/favorecido) — sinalizados, nunca somados duas vezes. */
  duplicateGroups: DuplicateGroup[];
  /** Registros descartados por serem o mesmo comprovante físico (hash + data + valor). */
  deduplicatedIds: string[];
  /** Categorias que aparecem como fixa e variável no período. */
  conflicts: ClassConflict[];
  /** Despesas sem classificação fixa/variável válida. */
  unclassified: LedgerEntry[];
  /** Lançamentos cujo tipo do lançamento contradiz o padrão da categoria. */
  typeConflicts: Array<{ id: string; transactionType: string | null; categoryDefaultType: string | null; category: string }>;
}

export interface ReportDataset {
  from: string;
  to: string;
  periodLabel: string;
  months: MonthBlock[];
  totals: {
    despesas: number; investimentos: number; total: number; fixed: number; variable: number; unclassified: number;
    despesasCents: number; investimentosCents: number; totalCents: number; fixedCents: number; variableCents: number; unclassifiedCents: number;
  };
  entries: LedgerEntry[];
  diagnostics: ReportDiagnostics;
  meta: {
    generatedAt: string;
    rowsFetched: number;
    rowsUsed: number;
    filters: { from: string; to: string; profileId: string | null; propertyId: string | null };
  };
}

interface Filters {
  from: string;
  to: string;
  profileId?: string | null;
  propertyId?: string | null;
}

const INVESTMENT_TYPES = new Set(["investimento", "patrimonial"]);
const FIXED_TYPES = new Set(["gasto_fixo"]);
const VARIABLE_TYPES = new Set(["gasto_variavel"]);

/** Soma financeira sempre em centavos inteiros — nunca float. */
export function sumCents(list: Array<{ cents: number }>): number {
  let acc = 0;
  for (const item of list) acc += item.cents;
  return acc;
}

export const centsToNumber = (cents: number) => Math.round(cents) / 100;
export const toCents = (value: unknown) => Math.round(Math.abs(Number(value ?? 0)) * 100);

function pct(part: number, whole: number) {
  return whole > 0 ? (part / whole) * 100 : 0;
}

function groupCategories(entries: LedgerEntry[]): CategoryRow[] {
  const totalCents = sumCents(entries);
  const map = new Map<string, number>();
  for (const e of entries) map.set(e.category, (map.get(e.category) ?? 0) + e.cents);
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR"))
    .map(([name, cents]) => ({ name, cents, value: centsToNumber(cents), pct: pct(cents, totalCents) }));
}

function buildMemory(entries: LedgerEntry[]): MemoryRow[] {
  const totalCents = sumCents(entries);
  const catTotals = new Map<string, number>();
  for (const e of entries) catTotals.set(e.category, (catTotals.get(e.category) ?? 0) + e.cents);
  const map = new Map<string, MemoryRow & { _cents: number }>();
  for (const e of entries) {
    const k = `${e.category}||${e.subcategory}`;
    const cur = map.get(k) ?? { category: e.category, subcategory: e.subcategory, qty: 0, value: 0, cents: 0, pctCategory: 0, pctKind: 0, _cents: 0 };
    cur.qty += 1;
    cur.cents += e.cents;
    map.set(k, cur);
  }
  return [...map.values()]
    .map((r) => ({
      category: r.category,
      subcategory: r.subcategory,
      qty: r.qty,
      cents: r.cents,
      value: centsToNumber(r.cents),
      pctCategory: pct(r.cents, catTotals.get(r.category) ?? 0),
      pctKind: pct(r.cents, totalCents),
    }))
    .sort((a, b) => a.category.localeCompare(b.category, "pt-BR") || b.cents - a.cents);
}

function buildKindBlock(entries: LedgerEntry[]): KindBlock {
  const totalCents = sumCents(entries);
  return {
    totalCents,
    total: centsToNumber(totalCents),
    categories: groupCategories(entries),
    memory: buildMemory(entries),
    uncategorized: entries.filter((e) => !e.hasCategory),
  };
}

/**
 * Classificação de gasto fixo/variável na ordem oficial:
 * 1) tipo explícito do próprio lançamento;
 * 2) tipo padrão da subcategoria;
 * 3) tipo padrão da categoria pai;
 * 4) "Não classificado".
 * Nunca por texto de descrição, favorecido ou recorrência.
 */
export function classifySpend(
  transactionType: string | null,
  categoryDefaultType: string | null,
  parentDefaultType: string | null,
): { spendClass: SpendClass; classSource: ClassSource } {
  const t = transactionType ?? null;
  if (t && FIXED_TYPES.has(t)) return { spendClass: "fixed", classSource: "entry" };
  if (t && VARIABLE_TYPES.has(t)) return { spendClass: "variable", classSource: "entry" };
  for (const d of [categoryDefaultType, parentDefaultType]) {
    if (d && FIXED_TYPES.has(d)) return { spendClass: "fixed", classSource: "category" };
    if (d && VARIABLE_TYPES.has(d)) return { spendClass: "variable", classSource: "category" };
  }
  return { spendClass: "unclassified", classSource: "none" };
}

/** Investimento vem do tipo explícito; sem tipo explícito, cai no padrão da categoria. */
export function classifyKind(
  transactionType: string | null,
  categoryDefaultType: string | null,
  parentDefaultType: string | null,
): ReportKindKey {
  if (transactionType) return INVESTMENT_TYPES.has(transactionType) ? "investimento" : "despesa";
  if (categoryDefaultType) return INVESTMENT_TYPES.has(categoryDefaultType) ? "investimento" : "despesa";
  if (parentDefaultType) return INVESTMENT_TYPES.has(parentDefaultType) ? "investimento" : "despesa";
  return "despesa";
}

const normalizePayee = (v: string | null | undefined) =>
  String(v ?? "").trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Carrega os comprovantes aprovados (mesma fonte de verdade do dashboard e dos
 * demais relatórios) e monta um único snapshot normalizado.
 * O filtro usa `payment_date` (data financeira real), comparado como texto
 * YYYY-MM-DD — sem conversão de fuso, inclusivo nas duas pontas.
 */
export async function loadReportDataset(f: Filters): Promise<ReportDataset> {
  const { data: cats, error: catError } = await supabase.from("categories").select("id, name, parent_id, default_type");
  if (catError) throw new Error(`Falha ao carregar categorias: ${catError.message}`);
  const catById = new Map((cats ?? []).map((c) => [c.id, c]));

  const PAGE = 1000;
  const rows: any[] = [];
  for (let offset = 0; offset < 100000; offset += PAGE) {
    let q = supabase
      .from("receipts")
      .select("id, payment_date, amount, transaction_type, category_id, recipient_name, bank_name, description, notes, payment_method, profile_id, property_id, file_hash, import_row_id, category:categories!receipts_category_id_fkey(name)")
      .eq("status", "approved")
      .order("payment_date", { ascending: true })
      .order("id", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (f.from) q = q.gte("payment_date", f.from);
    if (f.to) q = q.lte("payment_date", f.to);
    if (f.profileId) q = q.eq("profile_id", f.profileId);
    if (f.propertyId) q = q.eq("property_id", f.propertyId);
    const { data, error } = await q;
    // Falha de consulta NUNCA vira relatório zerado.
    if (error) throw new Error(`Falha ao carregar lançamentos: ${error.message}`);
    const page = data ?? [];
    rows.push(...page);
    if (page.length < PAGE) break;
  }

  const rowsFetched = rows.length;

  // Deduplicação canônica: mesmo comprovante físico (hash + data + valor) e
  // mesma linha de importação não podem entrar duas vezes.
  const seenCanonical = new Set<string>();
  const seenIds = new Set<string>();
  const deduplicatedIds: string[] = [];
  const usable: any[] = [];
  for (const r of rows) {
    if (!r.payment_date) continue;
    if (seenIds.has(r.id)) { deduplicatedIds.push(r.id); continue; }
    seenIds.add(r.id);
    const canonical = r.file_hash
      ? `h:${r.file_hash}|${String(r.payment_date).slice(0, 10)}|${toCents(r.amount)}`
      : r.import_row_id
        ? `i:${r.import_row_id}`
        : null;
    if (canonical) {
      if (seenCanonical.has(canonical)) { deduplicatedIds.push(r.id); continue; }
      seenCanonical.add(canonical);
    }
    usable.push(r);
  }

  const typeConflicts: ReportDiagnostics["typeConflicts"] = [];

  const entries: LedgerEntry[] = usable.map((r) => {
    const cat = r.category_id ? catById.get(r.category_id) : null;
    const parent = cat?.parent_id ? catById.get(cat.parent_id) : null;
    const category = parent?.name ?? cat?.name ?? UNCATEGORIZED;
    const subcategory = cat?.name ?? "Não identificado";
    const t = (r.transaction_type as string | null) ?? null;
    const catDefault = (cat?.default_type as string | null) ?? null;
    const parentDefault = (parent?.default_type as string | null) ?? null;
    const kind = classifyKind(t, catDefault, parentDefault);
    const { spendClass, classSource } = kind === "despesa"
      ? classifySpend(t, catDefault, parentDefault)
      : { spendClass: "unclassified" as SpendClass, classSource: "none" as ClassSource };
    const cents = toCents(r.amount);

    if (t && catDefault && INVESTMENT_TYPES.has(catDefault) !== INVESTMENT_TYPES.has(t)) {
      typeConflicts.push({ id: r.id, transactionType: t, categoryDefaultType: catDefault, category });
    }

    return {
      id: r.id,
      date: String(r.payment_date).slice(0, 10),
      cents,
      amount: centsToNumber(cents),
      kind,
      spendClass,
      classSource,
      fixed: kind === "despesa" && spendClass === "fixed",
      variable: kind === "despesa" && spendClass === "variable",
      category,
      subcategory,
      hasCategory: Boolean(cat),
      payee: r.recipient_name ?? "—",
      account: kind === "investimento" ? "INVESTIMENTOS" : "DESPESAS",
      rawCategory: cat?.name ?? "Não identificado",
      notes: [r.description, r.notes].filter(Boolean).join("; "),
      transactionType: t,
      categoryDefaultType: catDefault,
    } satisfies LedgerEntry;
  });

  const monthKeys = [...new Set(entries.map((e) => e.date.slice(0, 7)))].sort();
  const months: MonthBlock[] = monthKeys.map((key) => {
    const list = entries.filter((e) => e.date.startsWith(key));
    const desp = list.filter((e) => e.kind === "despesa");
    const inv = list.filter((e) => e.kind === "investimento");
    const fixedList = desp.filter((e) => e.spendClass === "fixed");
    const varList = desp.filter((e) => e.spendClass === "variable");
    const unclList = desp.filter((e) => e.spendClass === "unclassified");
    const [y, m] = key.split("-");
    const despesasCents = sumCents(desp);
    const investimentosCents = sumCents(inv);
    const fixedCents = sumCents(fixedList);
    const variableCents = sumCents(varList);
    const unclassifiedCents = sumCents(unclList);
    const totalCents = despesasCents + investimentosCents;
    return {
      key,
      label: MONTH_NAMES[Number(m) - 1],
      year: Number(y),
      despesasCents,
      investimentosCents,
      totalCents,
      fixedCents,
      variableCents,
      unclassifiedCents,
      despesas: centsToNumber(despesasCents),
      investimentos: centsToNumber(investimentosCents),
      total: centsToNumber(totalCents),
      fixed: centsToNumber(fixedCents),
      variable: centsToNumber(variableCents),
      unclassified: centsToNumber(unclassifiedCents),
      fixedCategories: groupCategories(fixedList),
      variableCategories: groupCategories(varList),
      unclassifiedCategories: groupCategories(unclList),
      unclassifiedEntries: unclList,
      despesaBlock: buildKindBlock(desp),
      investimentoBlock: buildKindBlock(inv),
      entries: list,
    };
  });

  // Totais do período = soma dos meses (nunca o último mês).
  const sumMonths = (get: (m: MonthBlock) => number) => months.reduce((s, m) => s + get(m), 0);
  const despesasCents = sumMonths((m) => m.despesasCents);
  const investimentosCents = sumMonths((m) => m.investimentosCents);
  const fixedCents = sumMonths((m) => m.fixedCents);
  const variableCents = sumMonths((m) => m.variableCents);
  const unclassifiedCents = sumMonths((m) => m.unclassifiedCents);
  const totalCents = despesasCents + investimentosCents;

  const totals = {
    despesasCents, investimentosCents, totalCents, fixedCents, variableCents, unclassifiedCents,
    despesas: centsToNumber(despesasCents),
    investimentos: centsToNumber(investimentosCents),
    total: centsToNumber(totalCents),
    fixed: centsToNumber(fixedCents),
    variable: centsToNumber(variableCents),
    unclassified: centsToNumber(unclassifiedCents),
  };

  // Diagnósticos: nada é silenciado.
  const dupMap = new Map<string, DuplicateGroup>();
  for (const e of entries) {
    const key = `${e.date}|${e.cents}|${normalizePayee(e.payee)}`;
    const g = dupMap.get(key) ?? { key, date: e.date, payee: e.payee, cents: e.cents, ids: [] };
    g.ids.push(e.id);
    dupMap.set(key, g);
  }
  const duplicateGroups = [...dupMap.values()].filter((g) => g.ids.length > 1);

  const classMap = new Map<string, { fixedCents: number; variableCents: number; explicitFixed: boolean; explicitVariable: boolean }>();
  for (const e of entries) {
    if (e.kind !== "despesa" || e.spendClass === "unclassified") continue;
    const cur = classMap.get(e.category) ?? { fixedCents: 0, variableCents: 0, explicitFixed: false, explicitVariable: false };
    if (e.spendClass === "fixed") { cur.fixedCents += e.cents; cur.explicitFixed ||= e.classSource === "entry"; }
    else { cur.variableCents += e.cents; cur.explicitVariable ||= e.classSource === "entry"; }
    classMap.set(e.category, cur);
  }
  const conflicts: ClassConflict[] = [...classMap.entries()]
    .filter(([, v]) => v.fixedCents > 0 && v.variableCents > 0)
    .map(([category, v]) => ({
      category,
      fixedCents: v.fixedCents,
      variableCents: v.variableCents,
      // Divergência é legítima só quando os dois lados vêm de classificação explícita do lançamento.
      explicit: v.explicitFixed && v.explicitVariable,
    }));

  const diagnostics: ReportDiagnostics = {
    duplicateGroups,
    deduplicatedIds,
    conflicts,
    unclassified: entries.filter((e) => e.kind === "despesa" && e.spendClass === "unclassified"),
    typeConflicts,
  };

  const first = months[0];
  const last = months[months.length - 1];
  const periodLabel = first
    ? first.key === last.key
      ? `${first.label.toLowerCase()} de ${first.year}`
      : `${first.label.toLowerCase()} de ${first.year} a ${last.label.toLowerCase()} de ${last.year}`
    : "período sem lançamentos";

  return {
    from: f.from,
    to: f.to,
    periodLabel,
    months,
    totals,
    entries,
    diagnostics,
    meta: {
      generatedAt: new Date().toISOString(),
      rowsFetched,
      rowsUsed: entries.length,
      filters: { from: f.from, to: f.to, profileId: f.profileId ?? null, propertyId: f.propertyId ?? null },
    },
  };
}
