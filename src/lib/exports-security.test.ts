import { sanitizeSpreadsheetValue } from "./exports";

function check(input: unknown, expected: string) {
  const got = sanitizeSpreadsheetValue(input);
  if (got !== expected) throw new Error(`sanitize(${JSON.stringify(input)}) = ${JSON.stringify(got)}, esperado ${JSON.stringify(expected)}`);
  console.log(`  [OK] ${JSON.stringify(input)} -> ${JSON.stringify(got)}`);
}

console.log("--- TESTE REAL: PROTEÇÃO CONTRA FÓRMULAS EM EXPORTAÇÃO ---");
check("=1+1", "'=1+1");
check("=HYPERLINK(\"http://mal.co\")", "'=HYPERLINK(\"http://mal.co\")");
check("+55 11 99999", "'+55 11 99999");
check("-15,11", "'-15,11");
check("@SUM(A1)", "'@SUM(A1)");
check("\tcmd", "'\tcmd");
check("Pagamento Enel", "Pagamento Enel");
check("R$ 1.700,00", "R$ 1.700,00");
check(null, "");
check(undefined, "");
check(0, "0");
console.log("\n[PASS] Todos os gatilhos de fórmula são neutralizados e textos legítimos preservados.");
