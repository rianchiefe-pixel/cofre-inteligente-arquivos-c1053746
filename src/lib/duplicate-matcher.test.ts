import { parseMoneyToCents } from "./format.ts";
import { assertMatchingAmounts } from "./persistence-validator.ts";
import assert from "node:assert/strict";

// Mock minimal function factsFromFile equivalent for duplication logic
function mockFactsFromFile(f: any, originalFile?: any) {
  const ocr = originalFile ? originalFile.ocr_data : f.ocr_data;
  return {
    id: f.id,
    file_name: f.file_name,
    ocr: ocr,
    readable: f.readable !== false
  };
}

export async function runDuplicateTest() {
  console.log("🚀 Iniciando teste de arquivos DUPLICADOS...");

  // 1. Arquivo original (já processado anteriormente)
  const originalFile = {
    id: "original-file-uuid",
    file_name: "comprovante_100.pdf",
    ocr_data: { amount_raw: "100,00", amount: 100, date: "2026-07-25" },
    readable: true
  };

  // 2. Arquivo novo no lote atual (marcado como duplicado)
  const duplicateFile = {
    id: "new-file-uuid",
    file_name: "comprovante_100_copy.pdf",
    duplicate_of: "original-file-uuid",
    ocr_data: {}, // O Supabase deixa vazio para duplicados
    readable: true,
    status: "duplicate"
  };

  const rawFiles = [duplicateFile];
  
  // Hidratação (simulando a lógica de matchBatchReceipts que busca o original)
  const fileFacts = rawFiles.map(f => {
    // No código real, o matcher busca o original no banco. Aqui simulamos a hidratação:
    return mockFactsFromFile(f, originalFile);
  });

  // Mapa de fatos efetivos (O que o prompt pediu para implementar)
  const effectiveFileFactsById = new Map(
    fileFacts.map((fact) => [fact.id, fact])
  );

  // 3. Linha da planilha correspondente
  const row = {
    id: "row-uuid",
    amount: -100.00, // Despesa de 100
  };

  // 4. Vínculo gerado (payload)
  const p = {
    row_id: row.id,
    file_id: duplicateFile.id,
    is_primary: true
  };

  console.log("--- Validando Barreira de Persistência com Duplicado Hidratado ---");
  
  try {
    const effectiveFile = effectiveFileFactsById.get(p.file_id);
    assert.ok(effectiveFile, "Fato efetivo deve existir");
    
    // Lógica corrigida: usa effectiveFile.ocr em vez de duplicateFile.ocr_data
    const ocr = (effectiveFile.ocr ?? {}) as any;
    const receiptAmount = ocr.amount_raw ?? ocr.amount;
    
    console.log(`Linha: ${row.amount}, Recibo (Hidratado): ${receiptAmount}`);
    
    assert.notStrictEqual(receiptAmount, undefined, "receiptAmount não pode ser undefined");
    assert.notStrictEqual(receiptAmount, null, "receiptAmount não pode ser null");
    
    // Barreira real
    assertMatchingAmounts(row.amount, receiptAmount);
    console.log("✅ [PASS] Barreira de persistência aceitou o duplicado hidratado.");
    
    // Verificação de diagnóstico
    const included = effectiveFile.readable !== false;
    assert.strictEqual(included, true, "Duplicado legível deve ser incluído no matching");
    console.log("✅ [PASS] included_in_matching: true para duplicado legível.");

  } catch (err: any) {
    console.error(`❌ [FAIL] Erro no teste de duplicados: ${err.message}`);
    process.exit(1);
  }

  console.log("\n✨ Teste de duplicados concluído com sucesso!");
}

if (import.meta.main || (typeof process !== 'undefined' && process.argv[1]?.includes('duplicate-matcher.test.ts'))) {
  runDuplicateTest();
}
