
import { readSpreadsheet, detectHeader } from "./smart-import";
import { parseBrlAmount, parseMoneyToCents } from "./format";

async function testMonetaryImport() {
  console.log("--- TESTE REAL DE IMPORTAÇÃO DE VALORES CSV ---");
  console.log("MATCHER_BUILD_VERSION = 2026-07-26-monetary-assertion");

  const csvContent = `"Valor"\n"-15,11"\n"-400,00"\n"-1.700,00"\n"-17.630,14"`;
  
  const mockFile = {
    name: "valores.csv",
    type: "text/csv",
    arrayBuffer: async () => Buffer.from(csvContent, "utf-8"),
  } as unknown as File;

  try {
    const parsed = await readSpreadsheet(mockFile);
    const detection = detectHeader(parsed.matrix);
    const amountIdx = detection.mapping.amount;

    if (amountIdx === undefined) {
      throw new Error("Coluna 'Valor' não mapeada no CSV de teste.");
    }

    // Pular cabeçalho
    const rows = parsed.matrix.slice(1);
    
    const results = rows.map(row => {
      const rawValue = row[amountIdx];
      const numericValue = parseBrlAmount(rawValue);
      const centsValue = parseMoneyToCents(rawValue);
      return {
        original: rawValue,
        numeric: numericValue,
        cents: centsValue
      };
    });

    console.log("\nDiagnóstico de Conversão:");
    console.table(results);

    // Validações
    const expectations = [
      { raw: "-15,11", num: -15.11, cents: -1511 },
      { raw: "-400,00", num: -400, cents: -40000 },
      { raw: "-1.700,00", num: -1700, cents: -170000 },
      { raw: "-17.630,14", num: -17630.14, cents: -1763014 },
    ];

    expectations.forEach((expected, i) => {
      const actual = results[i];
      console.log(`Verificando "${expected.raw}":`);
      
      if (actual.numeric !== expected.num) {
        throw new Error(`FALHA: "${expected.raw}" -> esperado ${expected.num}, obtido ${actual.numeric}`);
      }
      console.log(`  [OK] Float: ${actual.numeric}`);

      if (actual.cents !== expected.cents) {
        throw new Error(`FALHA CENTS: "${expected.raw}" -> esperado ${expected.cents}, obtido ${actual.cents}`);
      }
      console.log(`  [OK] Cents: ${actual.cents}`);
    });

    console.log("\n[PASS] Todos os valores foram importados e convertidos corretamente seguindo o fluxo real.");

  } catch (err) {
    console.error("\nFALHA NO TESTE:", err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

testMonetaryImport();
