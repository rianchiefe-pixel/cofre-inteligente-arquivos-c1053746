// Testes reais (bun src/lib/reconciliation.test.ts)
import assert from "node:assert";
import {
  classifyFile,
  classifyRow,
  matchCardRowToItems,
  summarizeReconciliation,
  normalizeMerchant,
} from "./reconciliation";
import { parseMoneyToCents, parseOcrMoneyToCents, extractMoneyTokens } from "./format";

const ctx = (over: Partial<{ linked: string[]; review: string[]; stmt: string[] }> = {}) => ({
  linkedFileIds: new Set(over.linked ?? []),
  reviewFileIds: new Set(over.review ?? []),
  cardStatementFileIds: new Set(over.stmt ?? []),
});

// G. Valores brasileiros → centavos
assert.strictEqual(parseMoneyToCents("R$ 2.331,64"), 233164);
assert.strictEqual(parseMoneyToCents("R$ 2331,64"), 233164);
assert.strictEqual(parseOcrMoneyToCents("R$ 233164"), 233164);
assert.strictEqual(parseMoneyToCents("R$ 75,84"), 7584);
assert.strictEqual(parseMoneyToCents("R$ 54.000,00"), 5400000);
assert.strictEqual(parseMoneyToCents("-R$ 100,00"), -10000);
assert.strictEqual(parseOcrMoneyToCents("R$ 1234"), 123400);

// Valores concatenados no PDF nunca formam um único valor
assert.deepStrictEqual(extractMoneyTokens("R$ 15.987,66 100,00"), ["R$ 15.987,66", "100,00"]);
assert.strictEqual(parseOcrMoneyToCents("R$ 15.987,66 100,00"), 1598766);
assert.strictEqual(parseOcrMoneyToCents("R$ 7.400,05 100,00"), 740005);

// H. Magnitude: planilha negativa × comprovante positivo
assert.strictEqual(
  Math.abs(parseMoneyToCents("-100,00")!) === Math.abs(parseMoneyToCents("R$ 100,00")!),
  true,
);
assert.strictEqual(parseMoneyToCents("-100,00")! < 0, true);

// C. Arquivo não processado não é órfão
assert.strictEqual(
  classifyFile({ id: "f1", file_name: "a.pdf", status: "error", error_message: "OCR timeout" }, ctx()).state,
  "failed",
);
assert.strictEqual(
  classifyFile({ id: "f2", file_name: "b.pdf", status: "uploaded" }, ctx()).state,
  "unprocessed",
);

// D. Duplicidade não é órfã
assert.strictEqual(
  classifyFile({ id: "f3", file_name: "c.pdf", status: "duplicate", duplicate_of: "f9" }, ctx()).state,
  "duplicate",
);

// E. Arquivo sem valor não é ilegível
assert.strictEqual(
  classifyFile(
    { id: "f4", file_name: "d.pdf", status: "processed", readable: true, extracted_text: "texto sem valor" },
    ctx(),
  ).state,
  "orphan",
);
assert.strictEqual(
  classifyFile({ id: "f5", file_name: "e.pdf", status: "processed", readable: false }, ctx()).state,
  "unreadable",
);

// Arquivo de sistema não entra como órfão
assert.strictEqual(classifyFile({ id: "f6", file_name: "desktop.ini", status: "processed" }, ctx()).state, "system");

// Vinculado nunca é órfão nem possível
assert.strictEqual(
  classifyFile({ id: "f7", file_name: "g.pdf", status: "processed" }, ctx({ linked: ["f7"], review: ["f7"] })).state,
  "linked",
);

// Estados exclusivos das operações
assert.strictEqual(
  classifyRow({ id: "r1" }, [{ row_id: "r1", file_id: "f1", is_primary: true, confidence: "high" }], new Set()),
  "matched",
);
assert.strictEqual(
  classifyRow({ id: "r2" }, [{ row_id: "r2", file_id: "f1", is_primary: false, confidence: "review" }], new Set()),
  "needs_review",
);
assert.strictEqual(classifyRow({ id: "r3" }, [], new Set()), "not_found");
assert.strictEqual(classifyRow({ id: "r4", kind: "cartao_credito" }, [], new Set()), "card_not_matched");
assert.strictEqual(classifyRow({ id: "r5", kind: "cartao_credito" }, [], new Set(["r5"])), "card_matched");

// I. Uma fatura comprova várias operações de cartão
const items = [
  { id: "i1", txn_date: "2026-04-10", description: "POSTO SHELL BR", amount: 150.5 },
  { id: "i2", txn_date: "2026-04-12", description: "SUPERMERCADO ANGELONI", amount: 320.9 },
];
const d1 = matchCardRowToItems(
  { id: "cr1", kind: "cartao_credito", amount: -150.5, transaction_date: "2026-04-10", payee: "Posto Shell" },
  items,
);
const d2 = matchCardRowToItems(
  { id: "cr2", kind: "cartao_credito", amount: -320.9, transaction_date: "2026-04-12", payee: "Supermercado Angeloni" },
  items,
);
assert.strictEqual(d1.status, "matched");
assert.strictEqual(d1.itemId, "i1");
assert.strictEqual(d2.status, "matched");
assert.strictEqual(d2.itemId, "i2");

// J. Duas compras de mesmo valor exigem data + estabelecimento
const twins = [
  { id: "t1", txn_date: "2026-04-10", description: "LOJA A", amount: 99.9 },
  { id: "t2", txn_date: "2026-04-10", description: "LOJA B", amount: 99.9 },
];
const amb = matchCardRowToItems(
  { id: "cr3", kind: "cartao_credito", amount: -99.9, transaction_date: "2026-04-10", payee: "" },
  twins,
);
assert.strictEqual(amb.status, "ambiguous");
assert.strictEqual(amb.itemId, null);

// F. Contadores fechados e sem contagem dupla
const summary = summarizeReconciliation({
  batchId: "b1",
  rows: [{ id: "r1" }, { id: "r2" }, { id: "r3" }, { id: "r4", kind: "cartao_credito" }],
  files: [
    { id: "f1", file_name: "1.pdf", status: "processed", readable: true },
    { id: "f2", file_name: "2.pdf", status: "processed", readable: true },
    { id: "f3", file_name: "3.pdf", status: "duplicate", duplicate_of: "f1" },
    { id: "f4", file_name: "4.pdf", status: "error", error_message: "OCR falhou" },
    { id: "f5", file_name: "5.pdf", status: "uploaded" },
    { id: "f6", file_name: "desktop.ini", status: "processed" },
  ],
  links: [
    { row_id: "r1", file_id: "f1", is_primary: true, confidence: "high" },
    { row_id: "r2", file_id: "f2", is_primary: false, confidence: "review" },
    { row_id: "r3", file_id: "f404", is_primary: true, confidence: "high" }, // arquivo excluído
  ],
  cardItems: [],
});
assert.strictEqual(summary.files.received, 6);
assert.strictEqual(summary.files.linked, 1);
assert.strictEqual(summary.files.review, 1);
assert.strictEqual(summary.files.duplicate, 1);
assert.strictEqual(summary.files.failed, 1);
assert.strictEqual(summary.files.unprocessed, 1);
assert.strictEqual(summary.files.system, 1);
assert.strictEqual(summary.files.orphan, 0);
assert.strictEqual(summary.files.unreadable, 0);
assert.strictEqual(summary.consistency.files_balanced, true);
assert.strictEqual(summary.consistency.rows_balanced, true);
assert.strictEqual(summary.rows.matched, 1);
assert.strictEqual(summary.rows.needs_review, 1);
assert.strictEqual(summary.rows.not_found, 1);
assert.strictEqual(summary.rows.card_total, 1);
assert.strictEqual(summary.rows.card_matched, 0);

assert.strictEqual(normalizeMerchant("SUPERMERCADO ANGELONI LTDA"), "supermercado angeloni");

console.log("reconciliation.test.ts: todos os testes passaram");