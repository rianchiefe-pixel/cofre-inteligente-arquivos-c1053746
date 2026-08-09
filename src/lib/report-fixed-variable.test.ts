import assert from "node:assert/strict";
import { resolveReportType } from "./report-data";

describe("Modelo Financeiro do Relatório", () => {
  it("despesa deve ser um tipo próprio, não unclassified", () => {
    const result = resolveReportType("despesa", null, null);
    assert.strictEqual(result, "despesa");
  });

  it("gasto_fixo deve ser resolvido corretamente", () => {
    const result = resolveReportType(null, "gasto_fixo", null);
    assert.strictEqual(result, "gasto_fixo");
  });

  it("gasto_variavel deve ser resolvido corretamente", () => {
    const result = resolveReportType(null, null, "gasto_variavel");
    assert.strictEqual(result, "gasto_variavel");
  });

  it("investimento deve ser resolvido corretamente", () => {
    const result = resolveReportType("investimento", null, null);
    assert.strictEqual(result, "investimento");
  });

  it("patrimonial deve ser normalizado para investimento", () => {
    const result = resolveReportType("patrimonial", null, null);
    assert.strictEqual(result, "investimento");
  });

  it("prioridade deve ser: lançamento > categoria > pai", () => {
    assert.strictEqual(resolveReportType("despesa", "gasto_fixo", "investimento"), "despesa");
    assert.strictEqual(resolveReportType(null, "gasto_fixo", "investimento"), "gasto_fixo");
    assert.strictEqual(resolveReportType(null, null, "investimento"), "investimento");
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
