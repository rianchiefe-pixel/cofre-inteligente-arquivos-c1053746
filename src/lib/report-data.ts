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
}

export interface CategoryRow { 
  id: string; 
  name: string; 
  value: number; 
  cents: number; 
  pct: number;
}

export interface MonthBlock {
  key: string;
  label: string;
  year: number;
  
  // Totals per group (cents and decimal)
  despesaCents: number;
  fixedCents: number;
  variableCents: number;
  investimentoCents: number;
  unclassifiedCents: number;
  totalCents: number;

  despesa: number;
  fixed: number;
  variable: number;
  investimento: number;
  unclassified: number;
  total: number;

  // Category composition per group
  despesaCategories: CategoryRow[];
  fixedCategories: CategoryRow[];
  variableCategories: CategoryRow[];
  investimentoCategories: CategoryRow[];
  
  entries: LedgerEntry[];
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
    investimentoCents: number;
    unclassifiedCents: number;
    totalCents: number;
    
    despesa: number;
    fixed: number;
    variable: number;
    investimento: number;
    unclassified: number;
    total: number;
  };
  entries: LedgerEntry[];
  meta: {
    generatedAt: string;
    rowsFetched: number;
    rowsUsed: number;
    filters: { from: string; to: string; profileId: string | null; propertyId: string | null };
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

    const specificName = isGeneric && e.payee !== "—" ? e.payee : displayName;
    
    const key = e.categoryId ?? specificName;
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
      // Adicionamos os IDs de origem para auditoria
      sourceReceiptIds: Array.from(data.sourceReceiptIds)
    } as any));
}



/**
 * Função Canônica de Resolução de Tipo do Relatório.
 * Regra ABSOLUTA: A fonte da verdade é o PRÓPRIO LANÇAMENTO (transaction_type).
 * Categoria é usada apenas para organização visual posterior.
 */
export function resolveReportType(
  transactionType: string | null
): ReportFinancialType {
  if (transactionType) {
    if (EXPENSE_TYPES.has(transactionType)) return "despesa";
    if (INVESTMENT_TYPES.has(transactionType)) return "investimento";
  }
  
  return "unclassified";
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


export async function loadReportDataset(f: { from: string; to: string; profileId: string; propertyId?: string | null }): Promise<ReportDataset> {
  if (!f.profileId || f.profileId === "all") {
    throw new Error("ID do perfil é obrigatório para carregar o dataset do relatório.");
  }
  const { data: cats, error: catError } = await supabase.from("categories").select("id, name, parent_id, default_type, expense_behavior");
  if (catError) throw new Error(`Falha ao carregar categorias: ${catError.message}`);
  const catById = new Map((cats ?? []).map((c) => [c.id, c]));

  const rows: any[] = [];
  const PAGE = 1000;
  console.log('REPORT_FETCH_STARTED');
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
    if (f.propertyId) q = q.eq("property_id", f.propertyId);
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
    
    let canonicalNature: ReportFinancialType = "unclassified";
    let canonicalBehavior = r.expense_behavior;

    if (r.transaction_type === "investimento") {
      canonicalNature = "investimento";
      canonicalBehavior = null;
    } else if (r.transaction_type === "despesa") {
      canonicalNature = "despesa";
    } else if (r.transaction_type === "gasto_fixo") {
      canonicalNature = "despesa";
      canonicalBehavior = r.expense_behavior ?? "fixed";
    } else if (r.transaction_type === "gasto_variavel") {
      canonicalNature = "despesa";
      canonicalBehavior = r.expense_behavior ?? "variable";
    }

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
    } as LedgerEntry & { profile_id: string }; // Mantemos profile_id para auditorias internas se necessário
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
    const iList = list.filter(e => e.reportType === "investimento");
    const uList = list.filter(e => e.reportType === "unclassified");

    const despesaCents = dList.reduce((s, e) => s + e.cents, 0);
    const fixedCents = fList.reduce((s, e) => s + e.cents, 0);
    const variableCents = vList.reduce((s, e) => s + e.cents, 0);
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
      despesaCents, fixedCents, variableCents, investimentoCents, unclassifiedCents, totalCents,
      despesa: centsToNumber(despesaCents),
      fixed: centsToNumber(fixedCents),
      variable: centsToNumber(variableCents),
      investimento: centsToNumber(investimentoCents),
      unclassified: centsToNumber(unclassifiedCents),
      total: centsToNumber(totalCents),
      despesaCategories: groupCategories(dList),
      fixedCategories: groupCategories(fList),
      variableCategories: groupCategories(vList),
      investimentoCategories: groupCategories(iList),
      entries: list,
    };
  });

  const totals = months.reduce((acc, m) => ({
    despesaCents: acc.despesaCents + m.despesaCents,
    fixedCents: acc.fixedCents + m.fixedCents,
    variableCents: acc.variableCents + m.variableCents,
    investimentoCents: acc.investimentoCents + m.investimentoCents,
    unclassifiedCents: acc.unclassifiedCents + m.unclassifiedCents,
    totalCents: acc.totalCents + m.totalCents, // This already excludes unclassified at month level
  }), { despesaCents: 0, fixedCents: 0, variableCents: 0, investimentoCents: 0, unclassifiedCents: 0, totalCents: 0 });

  const first = months[0];
  const last = months[months.length - 1];
  const periodLabel = first ? (first.key === last.key ? `${first.label} de ${first.year}` : `${first.label} de ${first.year} a ${last.label} de ${last.year}`) : "Sem dados";

  return {
    from: f.from, to: f.to, periodLabel, months,
    totals: { ...totals, despesa: centsToNumber(totals.despesaCents), fixed: centsToNumber(totals.fixedCents), variable: centsToNumber(totals.variableCents), investimento: centsToNumber(totals.investimentoCents), unclassified: centsToNumber(totals.unclassifiedCents), total: centsToNumber(totals.totalCents) },
    entries,
    meta: { generatedAt: new Date().toISOString(), rowsFetched: rows.length, rowsUsed: entries.length, filters: { from: f.from, to: f.to, profileId: f.profileId ?? null, propertyId: f.propertyId ?? null } }
  };
}
