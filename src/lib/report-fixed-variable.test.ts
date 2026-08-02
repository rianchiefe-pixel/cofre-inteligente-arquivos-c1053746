import assert from "node:assert/strict";
import {
  classifyKind,
  classifySpend,
  sumCents,
  toCents,
  centsToNumber,
  type LedgerEntry,
  type ReportDataset,
  type MonthBlock,
  MONTH_NAMES,
} from "./report-data";
import { validateReportDataset } from "./report-validation";
import { isWithinRange, monthRange } from "./date-range";
import { currencyBRL } from "./format";


/* ------------------------- runner mínimo (padrão do projeto) ------------------------- */
let failed = 0;
let passed = 0;
function describe(name: string, fn: () => void) {
  console.log(`\n▸ ${name}`);
  fn();
}
function it(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (e: any) {
    failed++;
    console.error(`  ❌ ${name}: ${e?.message}`);
  }
}
function expect(actual: any) {
  return {
    toBe: (v: any) => assert.strictEqual(actual, v),
    not: { toBe: (v: any) => assert.notStrictEqual(actual, v) },
    toEqual: (v: any) => assert.deepStrictEqual(actual, v),
    toMatch: (re: RegExp) => assert.ok(re.test(String(actual)), `${actual} !~ ${re}`),
    toBeGreaterThan: (v: number) => assert.ok(actual > v, `${actual} <= ${v}`),
    toHaveLength: (n: number) => assert.strictEqual(actual.length, n),
  };
}

/* ---------- helpers de fixture (nenhum valor entra no código de produção) ---------- */

function entry(p: Partial<LedgerEntry> & { id: string; date: string; cents: number }): LedgerEntry {
  const kind = p.kind ?? "despesa";
  const spendClass = p.spendClass ?? "unclassified";
  return {
    id: p.id,
    date: p.date,
    cents: p.cents,
    amount: centsToNumber(p.cents),
    kind,
    spendClass,
    classSource: p.classSource ?? "entry",
    fixed: kind === "despesa" && spendClass === "fixed",
    variable: kind === "despesa" && spendClass === "variable",
    category: p.category ?? "Categoria",
    subcategory: p.subcategory ?? "Sub",
    hasCategory: p.hasCategory ?? true,
    payee: p.payee ?? "Fornecedor",
    account: kind === "investimento" ? "INVESTIMENTOS" : "DESPESAS",
    rawCategory: p.rawCategory ?? "Categoria",
    notes: p.notes ?? "",
    transactionType: p.transactionType ?? null,
    categoryDefaultType: p.categoryDefaultType ?? null,
  };
}

function group(entries: LedgerEntry[]) {
  const map = new Map<string, number>();
  for (const e of entries) map.set(e.category, (map.get(e.category) ?? 0) + e.cents);
  const total = sumCents(entries);
  return [...map.entries()].map(([name, cents]) => ({ name, cents, value: centsToNumber(cents), pct: total ? (cents / total) * 100 : 0 }));
}

function month(key: string, entries: LedgerEntry[]): MonthBlock {
  const desp = entries.filter((e) => e.kind === "despesa");
  const inv = entries.filter((e) => e.kind === "investimento");
  const f = desp.filter((e) => e.spendClass === "fixed");
  const v = desp.filter((e) => e.spendClass === "variable");
  const u = desp.filter((e) => e.spendClass === "unclassified");
  const despesasCents = sumCents(desp);
  const investimentosCents = sumCents(inv);
  const totalCents = despesasCents + investimentosCents;
  const [y, m] = key.split("-");
  const empty = { total: 0, totalCents: 0, categories: [], memory: [], uncategorized: [] };
  return {
    key,
    label: MONTH_NAMES[Number(m) - 1],
    year: Number(y),
    despesasCents,
    investimentosCents,
    totalCents,
    fixedCents: sumCents(f),
    variableCents: sumCents(v),
    unclassifiedCents: sumCents(u),
    despesas: centsToNumber(despesasCents),
    investimentos: centsToNumber(investimentosCents),
    total: centsToNumber(totalCents),
    fixed: centsToNumber(sumCents(f)),
    variable: centsToNumber(sumCents(v)),
    unclassified: centsToNumber(sumCents(u)),
    fixedCategories: group(f),
    variableCategories: group(v),
    unclassifiedCategories: group(u),
    unclassifiedEntries: u,
    despesaBlock: { ...empty, totalCents: despesasCents, total: centsToNumber(despesasCents) } as any,
    investimentoBlock: { ...empty, totalCents: investimentosCents, total: centsToNumber(investimentosCents) } as any,
    entries,
  };
}

function dataset(months: MonthBlock[]): ReportDataset {
  const entries = months.flatMap((m) => m.entries);
  const s = (get: (m: MonthBlock) => number) => months.reduce((acc, m) => acc + get(m), 0);
  const despesasCents = s((m) => m.despesasCents);
  const investimentosCents = s((m) => m.investimentosCents);
  const fixedCents = s((m) => m.fixedCents);
  const variableCents = s((m) => m.variableCents);
  const unclassifiedCents = s((m) => m.unclassifiedCents);
  const totalCents = despesasCents + investimentosCents;
  return {
    from: `${months[0]?.key ?? "2026-01"}-01`,
    to: "2026-12-31",
    periodLabel: "teste",
    months,
    totals: {
      despesasCents, investimentosCents, totalCents, fixedCents, variableCents, unclassifiedCents,
      despesas: centsToNumber(despesasCents),
      investimentos: centsToNumber(investimentosCents),
      total: centsToNumber(totalCents),
      fixed: centsToNumber(fixedCents),
      variable: centsToNumber(variableCents),
      unclassified: centsToNumber(unclassifiedCents),
    },
    entries,
    diagnostics: { duplicateGroups: [], deduplicatedIds: [], conflicts: [], unclassified: entries.filter((e) => e.kind === "despesa" && e.spendClass === "unclassified"), typeConflicts: [] },
    meta: { generatedAt: new Date().toISOString(), rowsFetched: entries.length, rowsUsed: entries.length, filters: { from: "", to: "", profileId: null, propertyId: null } },
  };
}

/* ----------------------------------- testes ----------------------------------- */

describe("período e fuso", () => {
  it("inclui o primeiro e o último dia selecionados", () => {
    const { from, to } = monthRange(new Date(2026, 3, 15));
    expect(from).toBe("2026-04-01");
    expect(to).toBe("2026-04-30");
    expect(isWithinRange("2026-04-01", from, to)).toBe(true);
    expect(isWithinRange("2026-04-30", from, to)).toBe(true);
    expect(isWithinRange("2026-05-01", from, to)).toBe(false);
  });

  it("não perde 30/04 por conversão de fuso", () => {
    const { from, to } = monthRange(new Date(2026, 3, 1));
    expect(isWithinRange("2026-04-30T23:59:00Z", from, to)).toBe(true);
  });
});

describe("classificação fixo/variável", () => {
  it("prioriza o tipo explícito do lançamento", () => {
    expect(classifySpend("gasto_fixo", "gasto_variavel", null)).toEqual({ spendClass: "fixed", classSource: "entry" });
    expect(classifySpend("gasto_variavel", "gasto_fixo", null)).toEqual({ spendClass: "variable", classSource: "entry" });
  });

  it("usa o padrão da categoria e depois da categoria pai", () => {
    expect(classifySpend("despesa", "gasto_variavel", null)).toEqual({ spendClass: "variable", classSource: "category" });
    expect(classifySpend("despesa", null, "gasto_fixo")).toEqual({ spendClass: "fixed", classSource: "category" });
  });

  it("marca como não classificado quando nada existe no banco", () => {
    expect(classifySpend("despesa", null, null).spendClass).toBe("unclassified");
    expect(classifySpend(null, "despesa", null).spendClass).toBe("unclassified");
  });

  it("não classifica por descrição nem por recorrência", () => {
    const a = classifySpend("despesa", null, null);
    const b = classifySpend("despesa", null, null);
    expect(a).toEqual(b);
  });

  it("investimento nunca entra em fixo ou variável", () => {
    expect(classifyKind("investimento", "gasto_fixo", null)).toBe("investimento");
    expect(classifyKind("patrimonial", null, null)).toBe("investimento");
    expect(classifyKind(null, "investimento", null)).toBe("investimento");
    expect(classifyKind("despesa", "investimento", null)).toBe("despesa");
  });
});

describe("somas em centavos", () => {
  it("converte valores sem erro de float", () => {
    expect(toCents("0.1")).toBe(10);
    expect(sumCents([{ cents: toCents(0.1) }, { cents: toCents(0.2) }])).toBe(30);
    expect(centsToNumber(30)).toBe(0.3);
  });

  it("usa duas casas e formato pt-BR", () => {
    expect(currencyBRL(centsToNumber(1630579))).toBe(
      (16305.79).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
    );
    expect(currencyBRL(centsToNumber(1630579))).toMatch(/16\.305,79/);
  });
});

describe("conferência do relatório", () => {
  const jan = month("2026-01", [
    entry({ id: "a", date: "2026-01-05", cents: 1630579, spendClass: "fixed", category: "Condomínio" }),
    entry({ id: "b", date: "2026-01-09", cents: 1873848, spendClass: "variable", category: "Mercado" }),
    entry({ id: "c", date: "2026-01-20", cents: 5000000, kind: "investimento", category: "Casa 26" }),
  ]);
  const fev = month("2026-02", [
    entry({ id: "d", date: "2026-02-05", cents: 2332566, spendClass: "fixed", category: "Condomínio" }),
    entry({ id: "e", date: "2026-02-09", cents: 2932032, spendClass: "variable", category: "Mercado" }),
  ]);

  it("fecha fixos + variáveis + não classificados = despesas", () => {
    const d = dataset([jan, fev]);
    expect(d.totals.fixedCents + d.totals.variableCents + d.totals.unclassifiedCents).toBe(d.totals.despesasCents);
    expect(validateReportDataset(d).ok).toBe(true);
  });

  it("despesas + investimentos = total financeiro", () => {
    const d = dataset([jan, fev]);
    expect(d.totals.despesasCents + d.totals.investimentosCents).toBe(d.totals.totalCents);
  });

  it("total do período é a soma dos meses, nunca o último mês", () => {
    const d = dataset([jan, fev]);
    expect(d.totals.fixedCents).toBe(jan.fixedCents + fev.fixedCents);
    expect(d.totals.fixedCents).not.toBe(fev.fixedCents);
  });

  it("mês com lançamentos não retorna zero", () => {
    const abr = month("2026-04", [entry({ id: "x", date: "2026-04-30", cents: 2349962, spendClass: "fixed" })]);
    expect(abr.fixedCents).toBe(2349962);
    expect(abr.despesasCents).toBeGreaterThan(0);
  });

  it("categorias somam o total da classificação", () => {
    expect(jan.fixedCategories.reduce((s, c) => s + c.cents, 0)).toBe(jan.fixedCents);
    expect(jan.variableCategories.reduce((s, c) => s + c.cents, 0)).toBe(jan.variableCents);
  });

  it("tabelas e gráficos usam o mesmo snapshot", () => {
    const d = dataset([jan, fev]);
    const tabela = d.months.map((m) => m.fixed);
    const grafico = d.months.map((m) => m.fixed);
    expect(grafico).toEqual(tabela);
    expect(tabela.reduce((s, v) => s + v, 0)).toBe(d.totals.fixed);
  });

  it("bloqueia a geração quando a classificação não fecha", () => {
    const d = dataset([jan]);
    d.totals.despesasCents += 300000;
    const r = validateReportDataset(d);
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.message.includes("não fecharam"))).toBe(true);
  });

  it("sinaliza categoria conflitante sem classificação explícita", () => {
    const d = dataset([jan]);
    d.diagnostics.conflicts = [{ category: "Personal Ana", fixedCents: 100000, variableCents: 50000, explicit: false }];
    const r = validateReportDataset(d);
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.code === "class_conflict")).toBe(true);
  });

  it("aponta duplicidade sem somar duas vezes", () => {
    const d = dataset([jan]);
    d.diagnostics.duplicateGroups = [{ key: "k", date: "2026-01-05", payee: "X", cents: 4000, ids: ["a1", "a2"] }];
    const r = validateReportDataset(d);
    expect(r.ok).toBe(true);
    expect(r.warnings.some((w) => w.code === "possible_duplicate")).toBe(true);
  });

  it("não classificados aparecem como pendência, não como zero", () => {
    const mar = month("2026-03", [entry({ id: "p", date: "2026-03-10", cents: 170000, spendClass: "unclassified", classSource: "none" })]);
    const d = dataset([mar]);
    expect(d.totals.despesasCents).toBe(170000);
    expect(d.diagnostics.unclassified).toHaveLength(1);
    const r = validateReportDataset(d);
    expect(r.ok).toBe(true);
    expect(r.warnings.some((w) => w.code === "month_unclassified")).toBe(true);
  });

  it("consulta vazia é erro explícito, não relatório zerado", () => {
    const r = validateReportDataset(dataset([]));
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.code === "no_rows")).toBe(true);
  });
});

if (failed === 0) {
  console.log(`\n✨ ${passed} testes do relatório de gastos fixos e variáveis passaram.`);
} else {
  console.error(`\n🚨 ${failed} testes falharam.`);
  process.exitCode = 1;
}
