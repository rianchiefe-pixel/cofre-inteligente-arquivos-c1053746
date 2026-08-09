import { type MonthBlock, type ReportDataset } from "@/lib/report-data";

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

const brl = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function validateReportDataset(data: ReportDataset): ValidationResult {
  const errors: string[] = [];

  if (!data.entries.length) {
    errors.push("Nenhum lançamento aprovado foi encontrado no período selecionado.");
  }

  data.months.forEach(m => {
    const sum = m.despesaCents + m.fixedCents + m.variableCents + m.investimentoCents + m.unclassifiedCents;
    if (sum !== m.totalCents) {
      errors.push(`Total de ${m.label}/${m.year} diverge da soma dos grupos (${brl(sum)} vs ${brl(m.totalCents)}).`);
    }
  });

  const t = data.totals;
  const sumT = t.despesaCents + t.fixedCents + t.variableCents + t.investimentoCents + t.unclassifiedCents;
  if (sumT !== t.totalCents) {
    errors.push(`Total geral do período diverge da soma dos grupos (${brl(sumT)} vs ${brl(t.totalCents)}).`);
  }

  return { ok: errors.length === 0, errors };
}

export function assertReportDataset(data: ReportDataset) {
  const result = validateReportDataset(data);
  if (!result.ok) throw new Error(result.errors.join(" "));
}
