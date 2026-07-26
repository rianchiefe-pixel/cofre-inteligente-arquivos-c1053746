
import { readSpreadsheet, detectHeader } from "./smart-import";

async function testParser() {
  console.log("--- TESTE REAL DO PARSER ---");

  // Mock de File para o ambiente Bun/Node
  const csvContent = `"Id";"Valor";"Data";"Notas"\n"1";"-1.700,00";"30/04/2026";"Banco: Itaú; Forma: PIX"`;
  
  const mockFile = {
    name: "teste.csv",
    type: "text/csv",
    arrayBuffer: async () => Buffer.from(csvContent, "utf-8"),
  } as unknown as File;

  try {
    const parsed = await readSpreadsheet(mockFile);
    console.log("Separador detectado:", parsed.separator);

    if (parsed.separator !== ";") {
      throw new Error(`Separador incorreto detectado: esperado ";", obtido "${parsed.separator}"`);
    }

    const detection = detectHeader(parsed.matrix);
    const header = detection.header;
    
    console.log("Colunas detectadas:", header);

    // Validações
    const expected = ["Id", "Valor", "Data", "Notas"];
    const matches = expected.every((col, i) => header[i] === col);

    if (!matches || header.length !== 4) {
      console.error("ERRO: O cabeçalho não foi dividido corretamente.");
      console.error("Esperado:", expected);
      console.error("Obtido:", header);
      process.exit(1);
    }

    console.log("[PASS] O cabeçalho é dividido em colunas independentes.");

    const mapping = detection.mapping;
    if (mapping.amount !== undefined) {
      console.log(`[PASS] Valor é reconhecido como uma coluna (index ${mapping.amount}).`);
    } else {
      console.error("ERRO: Coluna Valor não mapeada.");
      process.exit(1);
    }

    if (mapping.date !== undefined) {
      console.log(`[PASS] Data é reconhecida como uma coluna (index ${mapping.date}).`);
    } else {
      console.error("ERRO: Coluna Data não mapeada.");
      process.exit(1);
    }

    const firstRow = parsed.matrix[1];
    if (firstRow && firstRow.length === 4) {
       console.log(`[PASS] Notas permanece como um único campo: "${firstRow[3]}"`);
    } else {
      console.error("ERRO: Linha de dados não processada corretamente.");
      console.error("Conteúdo da linha:", firstRow);
      process.exit(1);
    }

    console.log("\nRESULTADO FINAL: 100% de sucesso na detecção e segmentação do CSV complexo.");

  } catch (err) {
    console.error("Falha no teste:", err);
    process.exit(1);
  }
}

testParser();
