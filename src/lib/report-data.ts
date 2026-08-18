import { supabase } from "@/integrations/supabase/client";
import { isUncategorizedReceipt } from "./categorization-utils";


export const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

export const UNCATEGORIZED = "Sem categoria";

/**
 * ReportFinancialType defines the 4 main financial groups + unclassified.
 * This is the canonical source for the report's grouping logic.
 */
export type ReportFinancialType = 
  | "despesa" 
  | "investimento" 
  | "unclassified";


export interface LedgerEntry {
  id: string;
  date: string;
  cents: number;
  amount: number;
  /** The final resolved type for report grouping (despesa/investimento). */
  reportType: ReportFinancialType;
  /** expense_behavior (fixed/variable) */
  expenseBehavior: string | null;
  /** Specific categorization info */
  categoryId: string | null;
  categoryName: string;
  parentCategoryId: string | null;
  parentCategoryName: string | null;
  hasCategory: boolean;
  payee: string;
  account: string;
  notes: string;
  propertyId: string | null;
  propertyName: string | null;
}

export interface CategoryRow { 
  id: string; 
  name: string; 
  value: number; 
  cents: number; 
  pct: number;
  sourceReceiptIds?: string[];
}

export interface MonthBlock {
  key: string;
  label: string;
  year: number;
  
  // Totals per group (cents and decimal)
  despesaCents: number;
  fixedCents: number;
  variableCents: number;
  otherExpenseCents: number;
  investimentoCents: number;
  unclassifiedCents: number;
  totalCents: number;

  despesa: number;
  fixed: number;
  variable: number;
  otherExpense: number;
  investimento: number;
  unclassified: number;
  total: number;

  // Category composition per group
  despesaCategories: CategoryRow[];
  fixedCategories: CategoryRow[];
  variableCategories: CategoryRow[];
  otherExpenseCategories: CategoryRow[];
  investimentoCategories: CategoryRow[];
  
  entries: LedgerEntry[];
}

export interface PropertyRow {
  propertyId: string | null;
  propertyName: string;
  despesaCents: number;
  investimentoCents: number;
  totalCents: number;
  despesa: number;
  investimento: number;
  total: number;
  sourceReceiptIds: string[];
}

export interface ReportDataset {
  from: string;
  to: string;
  periodLabel: string;
  months: MonthBlock[];
  totals: {
    despesaCents: number;
    fixedCents: number;
    variableCents: number;
    otherExpenseCents: number;
    investimentoCents: number;
    unclassifiedCents: number;
    totalCents: number;
    
    despesa: number;
    fixed: number;
    variable: number;
    otherExpense: number;
    investimento: number;
    unclassified: number;
    total: number;
  };
  entries: LedgerEntry[];
  propertyBreakdown: PropertyRow[];
  meta: {
    generatedAt: string;
    rowsFetched: number;
    rowsUsed: number;
    filters: { from: string; to: string; profileId: string | null; propertyIds: string[] | null; categoryIds: string[] | null; recipients: string[] | null };
  };
}

const INVESTMENT_TYPES = new Set(["investimento", "patrimonial"]);
const EXPENSE_TYPES = new Set(["despesa", "gasto_fixo", "gasto_variavel"]);

export const centsToNumber = (cents: number) => Math.round(cents) / 100;
export const toCents = (value: unknown) => Math.round(Math.abs(Number(value ?? 0)) * 100);

function pct(part: number, whole: number) {
  return whole > 0 ? (part / whole) * 100 : 0;
}

/** 
 * Agrupa lançamentos por nome de exibição. 
 * Regra: Prioriza subcategoria, depois categoria, depois descrição/favorecido.
 * Isso garante que "Educação Ana" e "Educação Erick" sejam itens distintos.
 */
function groupCategories(entries: LedgerEntry[]): CategoryRow[] {
  const totalCents = entries.reduce((s, e) => s + e.cents, 0);
  const map = new Map<string, { name: string; cents: number; id: string; sourceReceiptIds: Set<string> }>();
  
  for (const e of entries) {
    const displayName = e.categoryName;
    const nameLower = displayName.toLowerCase();
    
    const isGeneric = 
      nameLower.includes("não identificado") ||
      nameLower.includes("não classificado") ||
      nameLower.includes("sem categoria") ||
      nameLower.includes("não informado") ||
      displayName === UNCATEGORIZED;

    const key = isGeneric ? `gen:${e.payee}:${e.id}` : (e.categoryId ?? displayName);
    const specificName = isGeneric && e.payee !== "—" ? e.payee : displayName;
    
    const existing = map.get(key) || { name: specificName, cents: 0, id: key, sourceReceiptIds: new Set() };
    existing.cents += e.cents;
    existing.sourceReceiptIds.add(e.id);
    map.set(key, existing);
  }

  return [...map.values()]
    .sort((a, b) => b.cents - a.cents || a.name.localeCompare(b.name, "pt-BR"))
    .map((data) => ({ 
      id: data.id, 
      name: data.name, 
      cents: data.cents, 
      value: centsToNumber(data.cents), 
      pct: pct(data.cents, totalCents),
      sourceReceiptIds: Array.from(data.sourceReceiptIds)
    }));
}

/**
 * Função Canônica de Normalização Financeira.
 * Regra ABSOLUTA: A fonte da verdade é o PRÓPRIO LANÇAMENTO.
 * O campo expense_behavior tem prioridade total sobre os transaction_type legados.
 */
export function normalizeFinancialClassification(r: { 
  transaction_type: string | null; 
  expense_behavior: string | null; 
}): { 
  nature: ReportFinancialType; 
  behavior: string | null;
} {
  const t = r.transaction_type;
  const b = r.expense_behavior;

  // Investimentos são soberanos e não possuem comportamento (fixed/variable)
  if (t === "investimento" || t === "patrimonial") {
    return { nature: "investimento", behavior: null };
  }

  // Se o tipo for legado (gasto_fixo/gasto_variavel), mapeamos para despesa + comportamento correspondente
  // MAS se houver um comportamento explícito (b), ele vence o legado.
  if (t === "gasto_fixo") {
    return { nature: "despesa", behavior: b ?? "fixed" };
  }
  if (t === "gasto_variavel") {
    return { nature: "despesa", behavior: b ?? "variable" };
  }

  // Caso padrão: despesa com comportamento explícito ou null
  return { nature: t === "despesa" ? "despesa" : "unclassified", behavior: b };
}

/** @deprecated use normalizeFinancialClassification */
export function resolveReportType(
  transactionType: string | null
): ReportFinancialType {
  const norm = normalizeFinancialClassification({ transaction_type: transactionType, expense_behavior: null });
  return norm.nature;
}

/**
 * Returns the filter for technical uncategorized categories to be used in SQL.
 */
export const TECHNICAL_UNCATEGORIZED_NAMES = [
  'Não identificado', 
  'não identificado', 
  'Não informado', 
  'não informado', 
  'Sem categoria', 
  'Sem categoria'
];


export async function loadReportDataset(f: { 
  from: string; 
  to: string; 
  profileId: string; 
  propertyIds?: string[] | null;
  categoryIds?: string[] | null;
  recipients?: string[] | null;
}): Promise<ReportDataset> {

  if (!f.profileId || f.profileId === "all") {
    throw new Error("ID do perfil é obrigatório para carregar o dataset do relatório.");
  }
  const { data: cats, error: catError } = await supabase.from("categories").select("id, name, parent_id, default_type, expense_behavior");
  if (catError) throw new Error(`Falha ao carregar categorias: ${catError.message}`);
  const catById = new Map((cats ?? []).map((c) => [c.id, c]));

  const { data: props, error: propsError } = await supabase.from("properties").select("id, name");
  if (propsError) throw new Error(`Falha ao carregar imóveis: ${propsError.message}`);
  const propById = new Map((props ?? []).map((p) => [p.id, p]));

  const rows: any[] = [];
  const PAGE = 1000;
  for (let offset = 0; offset < 100000; offset += PAGE) {
    let q = supabase
      .from("receipts")
      .select("id, payment_date, amount, transaction_type, expense_behavior, category_id, recipient_name, bank_name, description, notes, payment_method, profile_id, property_id, file_hash, import_row_id, updated_at")
      .eq("status", "approved")
      .order("payment_date", { ascending: true })
      .order("id", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (f.from) q = q.gte("payment_date", f.from);
    if (f.to) q = q.lte("payment_date", f.to);
    if (f.profileId) q = q.eq("profile_id", f.profileId);
    if (f.propertyIds && f.propertyIds.length > 0) q = q.in("property_id", f.propertyIds);
    if (f.categoryIds && f.categoryIds.length > 0) q = q.in("category_id", f.categoryIds);
    if (f.recipients && f.recipients.length > 0) q = q.in("recipient_name", f.recipients);

    const { data, error } = await q;
    if (error) throw new Error(`Falha ao carregar lançamentos: ${error.message}`);
    const page = data ?? [];
    if (page.some(r => r.profile_id !== f.profileId)) {
      throw new Error("Violação de isolamento: detectados registros de outro perfil no dataset.");
    }
    rows.push(...page);
    if (page.length < PAGE) break;
  }
  console.log('REPORT_FETCH_FINISHED', { rowsFetched: rows.length });

  // Deduplicação básica por hash/import_row
  const usable: any[] = [];
  const seenCanonical = new Set<string>();
  for (const r of rows) {
    if (!r.payment_date) continue;
    const canonical = r.file_hash ? `h:${r.file_hash}|${r.payment_date}|${toCents(r.amount)}` : (r.import_row_id ? `i:${r.import_row_id}` : null);
    if (canonical) {
      if (seenCanonical.has(canonical)) continue;
      seenCanonical.add(canonical);
    }
    usable.push(r);
  }

  const entries: LedgerEntry[] = usable.map((r) => {
    // Blindagem de Profile ID na normalização (Regra 9)
    if (r.profile_id !== f.profileId) {
      throw new Error(`PROFILE_ISOLATION_VIOLATION: Registro ${r.id} pertence ao perfil ${r.profile_id}, mas o perfil selecionado é ${f.profileId}.`);
    }

    const cat = r.category_id ? catById.get(r.category_id) : null;
    const parent = cat?.parent_id ? catById.get(cat.parent_id) : null;
    
    const { nature: canonicalNature, behavior: canonicalBehavior } = normalizeFinancialClassification({
      transaction_type: r.transaction_type,
      expense_behavior: r.expense_behavior
    });

    const cents = toCents(r.amount);

    return {
      id: r.id,
      date: String(r.payment_date).slice(0, 10),
      cents,
      amount: centsToNumber(cents),
      reportType: canonicalNature,
      expenseBehavior: canonicalBehavior,
      categoryId: cat?.id || null,
      categoryName: cat?.name || UNCATEGORIZED,
      parentCategoryId: parent?.id || null,
      parentCategoryName: parent?.name || null,
      hasCategory: !isUncategorizedReceipt({ category_id: r.category_id, categories: cat }),
      payee: r.recipient_name ?? "—",
      account: canonicalNature === "investimento" ? "INVESTIMENTOS" : "DESPESAS",
      notes: [r.description, r.notes].filter(Boolean).join("; "),
      propertyId: r.property_id || null,
      propertyName: propById.get(r.property_id)?.name || null,
    } as LedgerEntry & { profile_id: string; propertyId: string | null; propertyName: string | null };
  });

  // Conjunto Fechado (Regra 8)
  const REPORT_ALLOWED_RECEIPT_IDS = new Set(usable.map(r => r.id));


  const monthKeys = [...new Set(entries.map((e) => e.date.slice(0, 7)))].sort();
  const months: MonthBlock[] = monthKeys.map((key) => {
    const list = entries.filter((e) => e.date.startsWith(key));
    const [y, m] = key.split("-");
    
    const dList = list.filter(e => e.reportType === "despesa");
    const fList = list.filter(e => e.reportType === "despesa" && e.expenseBehavior === "fixed");
    const vList = list.filter(e => e.reportType === "despesa" && e.expenseBehavior === "variable");
    const oList = list.filter(e => e.reportType === "despesa" && e.expenseBehavior === null);
    const iList = list.filter(e => e.reportType === "investimento");
    const uList = list.filter(e => e.reportType === "unclassified");

    const despesaCents = dList.reduce((s, e) => s + e.cents, 0);
    const fixedCents = fList.reduce((s, e) => s + e.cents, 0);
    const variableCents = vList.reduce((s, e) => s + e.cents, 0);
    const otherExpenseCents = oList.reduce((s, e) => s + e.cents, 0);
    const investimentoCents = iList.reduce((s, e) => s + e.cents, 0);
    const unclassifiedCents = uList.reduce((s, e) => s + e.cents, 0);
    // Unclassified cents are excluded from the total to ensure consistency with visual reports
    // Regra 14: Blindagem defensiva de isolamento
    const foreignReceipts = list.filter(r => !REPORT_ALLOWED_RECEIPT_IDS.has(r.id));
    if (foreignReceipts.length > 0) {
      console.error("REPORT_RECEIPT_OUTSIDE_CANONICAL_DATASET:", foreignReceipts.map(r => r.id));
      throw new Error("REPORT_RECEIPT_OUTSIDE_CANONICAL_DATASET: Detectados registros fora do dataset canônico no agrupamento mensal.");
    }

    const totalCents = despesaCents + investimentoCents;


    return {
      key,
      label: MONTH_NAMES[Number(m) - 1],
      year: Number(y),
      despesaCents, fixedCents, variableCents, otherExpenseCents, investimentoCents, unclassifiedCents, totalCents,
      despesa: centsToNumber(despesaCents),
      fixed: centsToNumber(fixedCents),
      variable: centsToNumber(variableCents),
      otherExpense: centsToNumber(otherExpenseCents),
      investimento: centsToNumber(investimentoCents),
      unclassified: centsToNumber(unclassifiedCents),
      total: centsToNumber(totalCents),
      despesaCategories: groupCategories(dList),
      fixedCategories: groupCategories(fList),
      variableCategories: groupCategories(vList),
      otherExpenseCategories: groupCategories(oList),
      investimentoCategories: groupCategories(iList),
      entries: list,
    };
  });

  const totals = months.reduce((acc, m) => ({
    despesaCents: acc.despesaCents + m.despesaCents,
    fixedCents: acc.fixedCents + m.fixedCents,
    variableCents: acc.variableCents + m.variableCents,
    otherExpenseCents: acc.otherExpenseCents + m.otherExpenseCents,
    investimentoCents: acc.investimentoCents + m.investimentoCents,
    unclassifiedCents: acc.unclassifiedCents + m.unclassifiedCents,
    totalCents: acc.totalCents + m.totalCents, // This already excludes unclassified at month level
  }), { despesaCents: 0, fixedCents: 0, variableCents: 0, otherExpenseCents: 0, investimentoCents: 0, unclassifiedCents: 0, totalCents: 0 });

  // CUSTO POR IMÓVEL (Regra 5, 6, 7)
  const propMap = new Map<string | null, PropertyRow>();
  const isHolding = f.profileId === '2906fc21-93bc-42ad-8ca3-701b94fdb5f6';
  const generalLabel = isHolding ? "Despesas gerais da Holding / Sem imóvel vinculado" : "Geral / Sem imóvel vinculado";

  for (const e of entries) {
    const pid = e.propertyId;
    const pname = e.propertyName || generalLabel;
    
    const existing = propMap.get(pid) || {
      propertyId: pid,
      propertyName: pname,
      despesaCents: 0,
      investimentoCents: 0,
      totalCents: 0,
      despesa: 0,
      investimento: 0,
      total: 0,
      sourceReceiptIds: []
    };

    if (e.reportType === "despesa") existing.despesaCents += e.cents;
    else if (e.reportType === "investimento") existing.investimentoCents += e.cents;
    
    existing.totalCents = existing.despesaCents + existing.investimentoCents;
    existing.despesa = centsToNumber(existing.despesaCents);
    existing.investimento = centsToNumber(existing.investimentoCents);
    existing.total = centsToNumber(existing.totalCents);
    existing.sourceReceiptIds.push(e.id);
    
    propMap.set(pid, existing);
  }

  const propertyBreakdown = [...propMap.values()].sort((a, b) => b.totalCents - a.totalCents);

  const first = months[0];
  const last = months[months.length - 1];
  const periodLabel = first ? (first.key === last.key ? `${first.label} de ${first.year}` : `${first.label} de ${first.year} a ${last.label} de ${last.year}`) : "Sem dados";

  return {
    from: f.from, to: f.to, periodLabel, months,
    totals: { ...totals, despesa: centsToNumber(totals.despesaCents), fixed: centsToNumber(totals.fixedCents), variable: centsToNumber(totals.variableCents), otherExpense: centsToNumber(totals.otherExpenseCents), investimento: centsToNumber(totals.investimentoCents), unclassified: centsToNumber(totals.unclassifiedCents), total: centsToNumber(totals.totalCents) },
    entries,
    propertyBreakdown,
    meta: { generatedAt: new Date().toISOString(), rowsFetched: rows.length, rowsUsed: entries.length, filters: { from: f.from, to: f.to, profileId: f.profileId ?? null, propertyIds: f.propertyIds ?? null, categoryIds: f.categoryIds ?? null, recipients: f.recipients ?? null } }
  };
}