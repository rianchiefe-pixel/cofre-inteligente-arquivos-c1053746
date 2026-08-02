import { strict as assert } from "node:assert";
import {
  classifyAdvocaciaReceipt,
  extractPropertyHint,
  findExistingProperty,
  normalizeText,
  receiptEvidence,
} from "./advocacia-organizer";

function run(name: string, fn: () => void) {
  fn();
  console.log(`ok - ${name}`);
}

run("identidade explícita gera confiança alta", () => {
  const s = classifyAdvocaciaReceipt({ id: "1", recipient_name: "ADVOCACIA LILIANE PEREIRA" });
  assert.equal(s.matched, true);
  assert.equal(s.confidence, "high");
  assert.equal(s.categoryParent, "Receitas da advocacia");
});

run("termo forte isolado fica em média (revisão)", () => {
  const s = classifyAdvocaciaReceipt({ id: "2", description: "Pagamento de custas judiciais" });
  assert.equal(s.confidence, "medium");
  assert.equal(s.categoryChild, "Custas judiciais");
});

run("termo forte + identidade vira alta e categoria específica", () => {
  const s = classifyAdvocaciaReceipt({
    id: "3",
    recipient_name: "Liliane Pereira",
    description: "Guia de emolumentos do processo",
  });
  assert.equal(s.confidence, "high");
  assert.equal(s.categoryChild, "Emolumentos");
});

run("indício único isolado fica em confiança baixa (revisão manual)", () => {
  const s = classifyAdvocaciaReceipt({ id: "4", recipient_name: "Cartorio 5 Oficio" });
  assert.equal(s.matched, true);
  assert.equal(s.confidence, "low");
  assert.equal(s.categoryChild, "Cartórios");
});

run("sem evidência não altera nada", () => {
  const s = classifyAdvocaciaReceipt({ id: "5", recipient_name: "MANO LUBRIFICANTES E PECAS" });
  assert.equal(s.matched, false);
  assert.equal(s.categoryChild, null);
});

run("campos ai_* nunca entram na evidência", () => {
  const evidence = receiptEvidence({
    id: "6",
    recipient_name: "ONR",
    // @ts-expect-error garantindo que campos extras são ignorados
    ai_data: { payee: "Advocacia Liliane Pereira" },
  });
  assert.equal(evidence.includes("liliane"), false);
});

run("endereço com número é detectado e reaproveita imóvel existente", () => {
  const hint = extractPropertyHint(normalizeText("Aluguel Rua Sete de Setembro, 1200 sala 3"));
  assert.equal(hint, "rua sete de setembro, 1200");
  const found = findExistingProperty(hint!, [
    { id: "p1", name: "Sala Comercial", address: "Rua Sete de Setembro, 1200 - sala 3", registration: null },
  ]);
  assert.equal(found?.id, "p1");
});

run("endereço ausente não sugere imóvel", () => {
  assert.equal(extractPropertyHint(normalizeText("Honorarios advocaticios contrato mensal")), null);
});

console.log("todos os testes de organização da advocacia passaram");