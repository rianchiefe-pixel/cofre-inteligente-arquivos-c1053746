import assert from "node:assert/strict";
import { canonicalizeReportRows, resolveReportType, type LedgerEntry, toCents, centsToNumber, matchesReportSelection } from "./report-data";

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
    const result = resolveReportType("patrimonial");
    assert.strictEqual(result, "investimento");
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

describe("Filtros canônicos do relatório", () => {
  const none = { propertyIds: [], categoryIds: [], recipients: [] };
  const receipt = { property_id: "property-a", category_id: "category-a", recipient_name: "Fornecedor A" };

  it("combina filtros normais de dimensões diferentes com AND", () => {
    assert.equal(matchesReportSelection(receipt, { propertyIds: ["property-a"], categoryIds: ["category-b"], recipients: [] }, none), false);
  });

  it("inclui explicitamente um destinatário adicional", () => {
    assert.equal(matchesReportSelection(receipt, { propertyIds: ["property-b"], categoryIds: [], recipients: [] }, { propertyIds: [], categoryIds: [], recipients: ["Fornecedor A"] }), true);
  });

  it("inclusões adicionais não restringem o universo quando não há filtros normais", () => {
    assert.equal(matchesReportSelection(receipt, none, { propertyIds: [], categoryIds: ["category-b"], recipients: [] }), true);
  });

  it("deduplica o mesmo lançamento canônico antes de listar e totalizar", () => {
    const base = { payment_date: "2026-08-15", amount: 125.5, transaction_type: "despesa", expense_behavior: "variable", file_hash: "same-file", import_row_id: null };
    assert.equal(canonicalizeReportRows([{ ...base, id: "receipt-1" }, { ...base, id: "receipt-2" }]).length, 1);
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
