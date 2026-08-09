
import { parseBRDate } from './smart-import';

function testDate(input: any, expected: string | null) {
  const result = parseBRDate(input);
  if (result === expected) {
    console.log(`✅ Input: ${input} -> Output: ${result}`);
    return true;
  } else {
    console.error(`❌ Input: ${input} -> Expected: ${expected}, got: ${result}`);
    return false;
  }
}

console.log("Iniciando testes de conversão de data...");
const tests = [
  testDate("19/01/2026", "2026-01-19"),
  testDate("01/02/2026", "2026-02-01"),
  testDate("2026-03-15", "2026-03-15"),
  testDate(new Date(2026, 0, 19), "2026-01-19"), // Janeiro local
  testDate(46039, "2026-01-19"), // Excel serial para 19/01/2026
];

const allPassed = tests.every(Boolean);
console.log(allPassed ? "\nTodos os testes passaram!" : "\nAlguns testes falharam.");
process.exit(allPassed ? 0 : 1);
