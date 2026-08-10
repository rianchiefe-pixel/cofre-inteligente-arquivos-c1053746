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
    // Only despesa and investimento are the canonical groups. 
    // Fixed/Variable are subgroups and must NOT be added to the main validation sum.
    const sum = m.despesaCents + m.investimentoCents;
    if (Math.abs(sum - m.totalCents) > 1) { // Floating point tolerance if needed, though cents should be integer
      errors.push(`Total de ${m.label}/${m.year} diverge da soma dos grupos (${brl(sum)} vs ${brl(m.totalCents)}).`);
    }
  });

  const t = data.totals;
  const sumT = t.despesaCents + t.investimentoCents;
  if (Math.abs(sumT - t.totalCents) > 1) {
    errors.push(`Total geral do período diverge da soma dos grupos (${brl(sumT)} vs ${brl(t.totalCents)}).`);
  }

  return { ok: errors.length === 0, errors };
}

export function assertReportDataset(data: ReportDataset) {
  const result = validateReportDataset(data);
  if (!result.ok) throw new Error(result.errors.join(" "));
}
