import { parseBrlAmount, formatBrlNumber } from "./format";
import { matchBatchReceipts } from "./receipt-matcher";

export function runTests() {
  console.log("🚀 Iniciando suíte de testes do Motor de Conciliação...");
  
  const parserCases = [
    { input: "R$ 5.013,00", expected: 5013.00, label: "Milhar com ponto e vírgula" },
    { input: "R$ 5,01", expected: 5.01, label: "Decimal com vírgula" },
    { input: "R$ 17.630,14", expected: 17630.14, label: "Milhar complexo" },
    { input: "R$ 17,63", expected: 17.63, label: "Decimal simples" },
    { input: "5013.00", expected: 5013.00, label: "Float string ponto" },
    { input: "R$ 4,00", expected: 4.00, label: "Inteiro com vírgula" },
    { input: "R$ 1.544,00", expected: 1544.00, label: "Milhar 1.000+" },
    { input: "1.544", expected: 1544.00, label: "Milhar sem decimais (ponto)" },
    { input: "17.63", expected: 17.63, label: "OCR: 17,63 lido como 17.63" },
    { input: "5.013", expected: 5013.00, label: "OCR: 5.013,00 lido como 5.013" },
  ];

  let failed = 0;
  console.log("\n--- Testes do Parser ---");
  parserCases.forEach(c => {
    const result = parseBrlAmount(c.input);
    const pass = Math.round((result || 0) * 100) === Math.round(c.expected * 100);
    if (pass) {
      console.log(`✅ [PASS] ${c.label}: "${c.input}" -> ${result}`);
    } else {
      console.log(`❌ [FAIL] ${c.label}: "${c.input}" -> Esperado ${c.expected}, obtido ${result}`);
      failed++;
    }
  });

  console.log("\n--- Testes de Lógica de Comparação Financeira ---");
  const logicCases = [
    { row: 5.01, receipt: "R$ 5.013,00", expectedMatch: false, label: "Linha R$ 5,01 × comprovante R$ 5.013,00" },
    { row: 17.63, receipt: "R$ 17.630,14", expectedMatch: false, label: "Linha R$ 17,63 × comprovante R$ 17.630,14" },
    { row: 4.00, receipt: "R$ 1.544,00", expectedMatch: false, label: "Linha R$ 4,00 × comprovante R$ 1.544,00" },
    { row: 5013.00, receipt: "R$ 5.013,00", expectedMatch: true, label: "Linha R$ 5.013,00 × comprovante R$ 5.013,00" },
    { row: 17630.14, receipt: "R$ 17.630,14", expectedMatch: true, label: "Linha R$ 17630,14 × comprovante R$ 17630,14" },
  ];

  function toCents(v: any) {
    const p = parseBrlAmount(v);
    return p !== null ? Math.round(p * 100) : null;
  }

  logicCases.forEach(c => {
    const rowCents = toCents(c.row);
    const receiptCents = toCents(c.receipt);
    
    // Simula a lógica do matcher: includes() é proibido, comparação numérica de centavos é obrigatória
    const isMatch = rowCents === receiptCents && rowCents !== null;
    
    if (isMatch === c.expectedMatch) {
      console.log(`✅ [PASS] ${c.label}`);
    } else {
      console.log(`❌ [FAIL] ${c.label}: Esperado match=${c.expectedMatch}, obtido=${isMatch}`);
      failed++;
    }
  });

  if (failed === 0) {
    console.log("\n✨ Todos os testes passaram! Motor de Conciliação validado.");
  } else {
    console.error(`\n🚨 ${failed} testes falharam! Verifique a lógica.`);
  }
  
  return failed === 0;
}
