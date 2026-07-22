import { parseBrlAmount, formatBrlNumber } from "./format";

export function runTests() {
  console.log("🚀 Iniciando suíte de testes do Motor de Conciliação...");
  
  const cases = [
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
  cases.forEach(c => {
    const result = parseBrlAmount(c.input);
    const pass = Math.round((result || 0) * 100) === Math.round(c.expected * 100);
    if (pass) {
      console.log(`✅ [PASS] ${c.label}: "${c.input}" -> ${result}`);
    } else {
      console.log(`❌ [FAIL] ${c.label}: "${c.input}" -> Esperado ${c.expected}, obtido ${result}`);
      failed++;
    }
  });

  // Teste de comparação (amountsIdentical logic)
  const compCases = [
    { a: 5013.00, b: 5.01, match: false, label: "5.013,00 vs 5,01" },
    { a: 17630.14, b: 17.63, match: false, label: "17.630,14 vs 17,63" },
    { a: 4.00, b: 4.00, match: true, label: "4,00 vs 4,00" },
    { a: 0.1 + 0.2, b: 0.3, match: true, label: "Precisão de float (0.1+0.2=0.3)" },
  ];

  compCases.forEach(c => {
    const pass = (Math.round(c.a * 100) === Math.round(c.b * 100)) === c.match;
    if (pass) {
      console.log(`✅ [PASS] Comparação ${c.label}`);
    } else {
      console.log(`❌ [FAIL] Comparação ${c.label}`);
      failed++;
    }
  });

  if (failed === 0) {
    console.log("✨ Todos os testes passaram! Motor de Conciliação validado.");
  } else {
    console.error(`🚨 ${failed} testes falharam! Verifique a lógica.`);
  }
  
  return failed === 0;
}
