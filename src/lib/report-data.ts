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
const EXPENSE_TYPES = new Set(["despesa"]);

export const centsToNumber = (cents: number) => Math.round(cents) / 100;
export const toCents = (value: unknown) => Math.round(Math.abs(Number(value ?? 0)) * 100);

function pct(part: number, whole: number) {
  return whole > 0 ? (part / whole) * 100 : 0;
}

/** Agrupa lançamentos por category_id preservando o nome real da categoria. */
function groupCategories(entries: LedgerEntry[]): CategoryRow[] {
  const totalCents = entries.reduce((s, e) => s + e.cents, 0);
  const map = new Map<string, { name: string; cents: number }>();
  
  for (const e of entries) {
    const id = e.categoryId ?? "uncategorized";
    const name = e.categoryName.toLowerCase();
    
    // Filtro agressivo para remover categorias ausentes da agregação visual do relatório
    if (
      !e.categoryId ||
      name.includes("não identificado") ||
      name.includes("não classificado") ||
      name.includes("sem categoria") ||
      name.includes("não informado")
    ) {
      continue;
    }

    const existing = map.get(id) || { name: e.categoryName, cents: 0 };
    existing.cents += e.cents;
    map.set(id, existing);
  }

  return [...map.entries()]
    .sort((a, b) => b[1].cents - a[1].cents || a[1].name.localeCompare(b[1].name, "pt-BR"))
    .map(([id, data]) => ({ 
      id, 
      name: data.name, 
      cents: data.cents, 
      value: centsToNumber(data.cents), 
      pct: pct(data.cents, totalCents) 
    }));
}

/**
 * Função Canônica de Resolução de Tipo do Relatório.
 * Regras:
 * 1. Tipo explícito do lançamento (transaction_type)
 * 2. Tipo padrão da categoria (default_type)
 * 3. Tipo padrão da categoria pai (parent.default_type)
 * 4. Fallback: unclassified
 */
export function resolveReportType(
  transactionType: string | null,
  categoryDefaultType: string | null,
  parentDefaultType: string | null
): ReportFinancialType {
  // Use explicit transactionType if it's already one of the valid canonical types
  if (transactionType && (EXPENSE_TYPES.has(transactionType) || INVESTMENT_TYPES.has(transactionType))) {
    return transactionType as ReportFinancialType;
  }

  const types = [transactionType, categoryDefaultType, parentDefaultType];
  
  for (const t of types) {
    if (!t) continue;
    if (INVESTMENT_TYPES.has(t)) return "investimento";
    if (EXPENSE_TYPES.has(t)) return "despesa";
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
  for (let offset = 0; offset < 100000; offset += PAGE) {
    let q = supabase
      .from("receipts")
      .select("id, payment_date, amount, transaction_type, expense_behavior, category_id, recipient_name, bank_name, description, notes, payment_method, profile_id, property_id, file_hash, import_row_id")
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
    const cat = r.category_id ? catById.get(r.category_id) : null;
    const parent = cat?.parent_id ? catById.get(cat.parent_id) : null;
    
    const reportType = resolveReportType(
      r.transaction_type,
      cat?.default_type || null,
      parent?.default_type || null
    );

    const expenseBehavior = r.expense_behavior || cat?.expense_behavior || parent?.expense_behavior || null;

    const cents = toCents(r.amount);

    return {
      id: r.id,
      date: String(r.payment_date).slice(0, 10),
      cents,
      amount: centsToNumber(cents),
      reportType,
      expenseBehavior,
      categoryId: cat?.id || null,
      categoryName: cat?.name || UNCATEGORIZED,
      parentCategoryId: parent?.id || null,
      parentCategoryName: parent?.name || null,
      hasCategory: !isUncategorizedReceipt({ category_id: r.category_id, categories: cat }),

      payee: r.recipient_name ?? "—",
      account: reportType === "investimento" ? "INVESTIMENTOS" : "DESPESAS",
      notes: [r.description, r.notes].filter(Boolean).join("; "),
    };
  });

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
