import { sumCents, type MonthBlock, type ReportDataset } from "@/lib/report-data";

export interface ValidationIssue { code: string; message: string }
export interface ValidationResult {
  ok: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  log: Record<string, unknown>;
}

const brl = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Conferência obrigatória antes de gerar o PDF.
 * Toda soma é comparada em centavos inteiros — tolerância zero.
 */
export function validateReportDataset(data: ReportDataset): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  if (!data.entries.length) {
    errors.push({ code: "no_rows", message: "Nenhum lançamento aprovado foi encontrado no período selecionado." });
  }

  const checkMonth = (m: MonthBlock) => {
    const classified = m.fixedCents + m.variableCents + m.unclassifiedCents;
    if (classified !== m.despesasCents) {
      errors.push({
        code: "month_class_mismatch",
        message:
          `Os valores de ${m.label}/${m.year} não fecharam. Foram encontrados ${brl(m.despesasCents)} em despesas, ` +
          `mas apenas ${brl(classified)} foram classificados entre gastos fixos, variáveis e não classificados.`,
      });
    }
    if (m.despesasCents + m.investimentosCents !== m.totalCents) {
      errors.push({ code: "month_total_mismatch", message: `Total de ${m.label}/${m.year} diverge da soma de despesas e investimentos.` });
    }
    const catFixed = m.fixedCategories.reduce((s, c) => s + c.cents, 0);
    const catVar = m.variableCategories.reduce((s, c) => s + c.cents, 0);
    const catUncl = m.unclassifiedCategories.reduce((s, c) => s + c.cents, 0);
    if (catFixed !== m.fixedCents || catVar !== m.variableCents || catUncl !== m.unclassifiedCents) {
      errors.push({ code: "month_category_mismatch", message: `As categorias de ${m.label}/${m.year} não somam o total da classificação.` });
    }
    if (sumCents(m.entries) !== m.totalCents) {
      errors.push({ code: "month_entries_mismatch", message: `A soma dos lançamentos de ${m.label}/${m.year} diverge do total do mês.` });
    }
    if (m.unclassifiedCents > 0) {
      warnings.push({
        code: "month_unclassified",
        message: `${m.label}/${m.year} possui ${brl(m.unclassifiedCents)} em despesas sem classificação de gasto fixo ou variável.`,
      });
    }
  };
  data.months.forEach(checkMonth);

  const t = data.totals;
  const sumMonths = (get: (m: MonthBlock) => number) => data.months.reduce((s, m) => s + get(m), 0);
  const pairs: Array<[string, number, number]> = [
    ["despesas", t.despesasCents, sumMonths((m) => m.despesasCents)],
    ["investimentos", t.investimentosCents, sumMonths((m) => m.investimentosCents)],
    ["gastos fixos", t.fixedCents, sumMonths((m) => m.fixedCents)],
    ["gastos variáveis", t.variableCents, sumMonths((m) => m.variableCents)],
    ["não classificados", t.unclassifiedCents, sumMonths((m) => m.unclassifiedCents)],
    ["total financeiro", t.totalCents, sumMonths((m) => m.totalCents)],
  ];
  for (const [label, total, monthly] of pairs) {
    if (total !== monthly) {
      errors.push({ code: "period_total_mismatch", message: `O total de ${label} do período (${brl(total)}) não corresponde à soma dos meses (${brl(monthly)}).` });
    }
  }
  if (t.fixedCents + t.variableCents + t.unclassifiedCents !== t.despesasCents) {
    errors.push({
      code: "period_class_mismatch",
      message:
        `Não foi possível gerar o relatório porque os valores não fecharam. Foram encontrados ${brl(t.despesasCents)} em despesas, ` +
        `mas apenas ${brl(t.fixedCents + t.variableCents + t.unclassifiedCents)} foram classificados entre gastos fixos, variáveis e não classificados.`,
    });
  }
  if (t.despesasCents + t.investimentosCents !== t.totalCents) {
    errors.push({ code: "period_sum_mismatch", message: "Despesas e investimentos do período não somam o total financeiro." });
  }
  if (sumCents(data.entries) !== t.totalCents) {
    errors.push({ code: "entries_total_mismatch", message: "A soma dos lançamentos do snapshot diverge do total do período." });
  }

  for (const g of data.diagnostics.duplicateGroups) {
    warnings.push({ code: "possible_duplicate", message: `Possível duplicidade: ${g.ids.length} lançamentos de ${brl(g.cents)} em ${g.date} para "${g.payee}".` });
  }
  for (const c of data.diagnostics.conflicts) {
    const issue = { code: "class_conflict", message: `Conflito de classificação na categoria "${c.category}": ${brl(c.fixedCents)} como fixo e ${brl(c.variableCents)} como variável.` };
    warnings.push(issue);
  }
  for (const c of data.diagnostics.typeConflicts) {
    warnings.push({ code: "type_conflict", message: `Lançamento ${c.id} está como "${c.transactionType}" mas a categoria "${c.category}" tem padrão "${c.categoryDefaultType}".` });
  }

  const log = {
    generatedAt: data.meta.generatedAt,
    filters: data.meta.filters,
    rowsFetched: data.meta.rowsFetched,
    rowsUsed: data.meta.rowsUsed,
    deduplicated: data.diagnostics.deduplicatedIds,
    ids: data.entries.map((e) => e.id),
    totalsCents: {
      despesas: t.despesasCents, investimentos: t.investimentosCents, total: t.totalCents,
      fixed: t.fixedCents, variable: t.variableCents, unclassified: t.unclassifiedCents,
    },
    months: data.months.map((m) => ({
      key: m.key, despesas: m.despesasCents, investimentos: m.investimentosCents,
      total: m.totalCents, fixed: m.fixedCents, variable: m.variableCents, unclassified: m.unclassifiedCents,
    })),
    errors, warnings,
  };

  return { ok: errors.length === 0, errors, warnings, log };
}

export function assertReportDataset(data: ReportDataset): ValidationResult {
  const result = validateReportDataset(data);
  // Log técnico da geração — período, filtros, IDs, totais e divergências.
  console.info("[relatorio] conferência", result.log);
  if (!result.ok) throw new Error(result.errors.map((e) => e.message).join(" "));
  return result;
}
