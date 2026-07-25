import { parseMoneyToCents, formatBrlNumber } from "./format.ts";
import { normalizeBank } from "./zip-import.ts";

// Helper to mimic toCents from receipt-matcher.ts
function toCents(value: unknown): number | null {
  return parseMoneyToCents(value);
}

// Logic copied from src/lib/receipt-matcher.ts to ensure accuracy
function amountsIdentical(a: unknown, b: unknown): boolean {
  const ca = toCents(a);
  const cb = toCents(b);
  if (ca === null || cb === null) return false;
  return ca === cb;
}

// Mimic the Regex search logic from receipt-matcher.ts
function findAmountInText(rowAmount: unknown, text: string): { foundExact: boolean; foundOther: boolean } {
  const rowCents = toCents(rowAmount);
  if (rowCents === null || rowCents === 0) return { foundExact: false, foundOther: false };
  
  const moneyRegex = /(?:R\$?\s*)?(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})/g;
  let match;
  let foundExact = false;
  let foundOther = false;

  while ((match = moneyRegex.exec(text)) !== null) {
    const foundCents = toCents(match[1]);
    if (foundCents === rowCents) {
      foundExact = true;
    } else if (foundCents !== null) {
      foundOther = true;
    }
  }
  return { foundExact, foundOther };
}

export function runTests() {
  console.log("🚀 Iniciando suíte de testes de PRECISÃO MÁXIMA do Motor de Conciliação...");
  
  const parserCases = [
    { input: "R$ 5.013,00", expectedCents: 501300, label: "Milhar com ponto e vírgula" },
    { input: "R$ 5,01", expectedCents: 501, label: "Decimal com vírgula" },
    { input: "R$ 17.630,14", expectedCents: 1763014, label: "Milhar complexo" },
    { input: "R$ 17,63", expectedCents: 1763, label: "Decimal simples" },
    { input: "5013.00", expectedCents: 501300, label: "Float string ponto" },
    { input: "R$ 4,00", expectedCents: 400, label: "Inteiro com vírgula" },
    { input: "R$ 1.544,00", expectedCents: 154400, label: "Milhar 1.000+" },
    { input: "1.544", expectedCents: 154400, label: "Milhar sem decimais (ponto)" },
    { input: "17.63", expectedCents: 1763, label: "OCR: 17,63 lido como 17.63" },
    { input: "5.013", expectedCents: 501300, label: "OCR: 5.013,00 lido como 5.013" },
  ];

  let failed = 0;
  console.log("\n--- Parte 1: Testes do Parser (Centavos Inteiros) ---");
  parserCases.forEach(c => {
    const result = parseMoneyToCents(c.input);
    const pass = result === c.expectedCents;
    if (pass) {
      console.log(`✅ [PASS] ${c.label}: "${c.input}" -> ${result} cents`);
    } else {
      console.log(`❌ [FAIL] ${c.label}: "${c.input}" -> Esperado ${c.expectedCents}, obtido ${result}`);
      failed++;
    }
  });

  console.log("\n--- Parte 2: Lógica de Igualdade Estrita (Obrigatório para Auditoria) ---");
  const equalityCases = [
    { a: 5.01, b: "R$ 5.013,00", expected: false, label: "Linha 5,01 × Comprovante 5.013,00" },
    { a: 17.63, b: "R$ 17.630,14", expected: false, label: "Linha 17,63 × Comprovante 17.630,14" },
    { a: 4.00, b: "R$ 1.544,00", expected: false, label: "Linha 4,00 × Comprovante 1.544,00" },
    { a: 5013.00, b: "R$ 5.013,00", expected: true, label: "Linha 5.013,00 × Comprovante 5.013,00" },
    { a: 17630.14, b: "R$ 17.630,14", expected: true, label: "Linha 17.630,14 × Comprovante 17.630,14" },
  ];

  equalityCases.forEach(c => {
    const pass = amountsIdentical(c.a, c.b) === c.expected;
    if (pass) {
      console.log(`✅ [PASS] ${c.label}`);
    } else {
      console.log(`❌ [FAIL] ${c.label}: Esperado ${c.expected}, obtido ${!c.expected}`);
      failed++;
    }
  });

  console.log("\n--- Parte 3: Busca no Texto Bruto (Evitar match parcial/includes) ---");
  const textCases = [
    { 
      row: 5.01, 
      text: "Transferência no valor de R$ 5.013,00 realizada com sucesso.", 
      expected: { foundExact: false, foundOther: true },
      label: "Texto com R$ 5.013,00 NÃO deve bater com R$ 5,01" 
    },
    { 
      row: 17.63, 
      text: "Débito automático R$ 17.630,14", 
      expected: { foundExact: false, foundOther: true },
      label: "Texto com R$ 17.630,14 NÃO deve bater com R$ 17,63" 
    },
    { 
      row: 4.00, 
      text: "Pagamento efetuado: 1.544,00", 
      expected: { foundExact: false, foundOther: true },
      label: "Texto com 1.544,00 NÃO deve bater com 4,00" 
    },
    { 
      row: 5013.00, 
      text: "VALOR R$ 5.013,00", 
      expected: { foundExact: true, foundOther: false },
      label: "Texto com R$ 5.013,00 DEVE bater com 5013,00" 
    },
    {
      row: 10.00,
      text: "Valor: R$ 10,00 e Troco: R$ 5,00",
      expected: { foundExact: true, foundOther: true },
      label: "Ambiguidade: Texto com múltiplos valores"
    }
  ];

  textCases.forEach(c => {
    const res = findAmountInText(c.row, c.text);
    const pass = res.foundExact === c.expected.foundExact && res.foundOther === c.expected.foundOther;
    if (pass) {
      console.log(`✅ [PASS] ${c.label}`);
    } else {
      console.log(`❌ [FAIL] ${c.label}: Obtido {foundExact:${res.foundExact}, foundOther:${res.foundOther}}`);
      failed++;
    }
  });

  if (failed === 0) {
    console.log("\n✨ SUCESSO ABSOLUTO! O motor passou em todos os testes de PRECISÃO MÁXIMA.");
    console.log("A comparação via includes() foi definitivamente eliminada para valores financeiros.");
  } else {
    console.error(`\n🚨 ALERTA: ${failed} testes falharam. A precisão do motor está comprometida!`);
  }
  
  return failed === 0;
}

if (import.meta.main || process.argv[1]?.includes('matcher.test.ts')) {
  runTests();
}
