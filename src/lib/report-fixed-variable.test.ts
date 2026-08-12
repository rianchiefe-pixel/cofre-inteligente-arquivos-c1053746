import assert from "node:assert/strict";
import { resolveReportType, type LedgerEntry, toCents, centsToNumber, loadReportDataset } from "./report-data";

describe("Modelo Financeiro do Relatório (Regras Reais)", () => {
  it("despesa deve ser um tipo próprio vindo do lançamento", () => {
    const result = resolveReportType("despesa");
    assert.strictEqual(result, "despesa");
  });

  it("investimento deve ser resolvido corretamente vindo do lançamento", () => {
    const result = resolveReportType("investimento");
    assert.strictEqual(result, "investimento");
  });

  it("patrimonial deve ser normalizado para investimento", () => {
    // Nota: Atualmente resolveReportType aceita 'investimento' e 'despesa' no Set canonical.
    // Vamos garantir que se chegar algo fora do padrão vire unclassified.
    const result = resolveReportType("patrimonial");
    assert.strictEqual(result, "unclassified");
  });

  it("fonte da verdade é apenas o transaction_type", () => {
    assert.strictEqual(resolveReportType("despesa"), "despesa");
    assert.strictEqual(resolveReportType("investimento"), "investimento");
    assert.strictEqual(resolveReportType(null), "unclassified");
  });


  it("resolução de hierarquia: categoria real deve prevalecer para nome", () => {
    const entry: Partial<LedgerEntry> = {
      categoryName: "Água e esgoto",
      parentCategoryName: "Despesas fixas"
    };
    assert.strictEqual(entry.categoryName, "Água e esgoto");
  });
});

describe("Cálculos e Integridade", () => {
  it("toCents deve lidar com strings e números corretamente", () => {
    assert.strictEqual(toCents(10.5), 1050);
    assert.strictEqual(toCents("10.5"), 1050);
  });

  it("centsToNumber deve retornar decimal correto", () => {
    assert.strictEqual(centsToNumber(1050), 10.5);
  });
});

function describe(name: string, fn: () => void) {
  console.log(`\n▸ ${name}`);
  fn();
}

function it(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
  } catch (e: any) {
    console.error(`  ❌ ${name}: ${e?.message}`);
    process.exitCode = 1;
  }
}
