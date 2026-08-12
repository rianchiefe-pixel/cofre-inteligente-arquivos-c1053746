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
    // Regra: TOTAL = DESPESAS + INVESTIMENTOS
    const sum = m.despesaCents + m.investimentoCents;
    if (Math.abs(sum - m.totalCents) > 1) {
      errors.push(`Total de ${m.label}/${m.year} diverge da soma dos grupos (${brl(sum)} vs ${brl(m.totalCents)}).`);
    }

    // Regra: FIXOS e VARIÁVEIS devem ser subconjuntos das despesas
    if (m.fixedCents > m.despesaCents + 1) {
        errors.push(`Total de Fixos em ${m.label} supera o total de Despesas.`);
    }
    if (m.variableCents > m.despesaCents + 1) {
        errors.push(`Total de Variáveis em ${m.label} supera o total de Despesas.`);
    }

    // Validação de Detalhamento: A soma das categorias detalhadas deve bater com o total do grupo
    const fixedTableSum = m.fixedCategories.reduce((s, c) => s + c.cents, 0);
    if (Math.abs(fixedTableSum - m.fixedCents) > 1) {
        errors.push(`Diferença no detalhamento de Fixos em ${m.label}: Tabela ${brl(fixedTableSum)} vs Grupo ${brl(m.fixedCents)}.`);
    }

    const variableTableSum = m.variableCategories.reduce((s, c) => s + c.cents, 0);
    if (Math.abs(variableTableSum - m.variableCents) > 1) {
        errors.push(`Diferença no detalhamento de Variáveis em ${m.label}: Tabela ${brl(variableTableSum)} vs Grupo ${brl(m.variableCents)}.`);
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
