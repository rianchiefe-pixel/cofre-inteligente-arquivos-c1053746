import JSZip from "jszip";
import { supabase } from "@/integrations/supabase/client";
import { extractReceiptFacts, storageSafeName, guessMime } from "./zip-import";
import { findAnalysisCandidates } from "./receipt-analysis.functions";

/**
 * Motor de análise de ZIP para a nova aba "Analisar Comprovantes".
 * REUTILIZA o código de extração mas isola em novas tabelas.
 */

export type AnalysisProgress = {
  filesFound: number;
  filesProcessed: number;
  alreadyFound: number;
  notFound: number;
  needsReview: number;
  errors: number;
  percent: number;
  currentFile?: string;
};

export type AnalysisCallback = (p: AnalysisProgress) => void;

async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function processAnalysisZip(
  file: File,
  userId: string,
  onProgress: AnalysisCallback
): Promise<string> {
  let zip;
  try {
    zip = await JSZip.loadAsync(file);
  } catch (error) {
    console.error("[ANALYZE] JSZip.loadAsync falhou:", error);
    throw new Error(
      "Não foi possível abrir o ZIP. Verifique se o arquivo está íntegro e não possui senha."
    );
  }
  const entries: { path: string; entry: JSZip.JSZipObject }[] = [];
  zip.forEach((path, entry) => {
    if (entry.dir) return;
    
    // Ignorar lixo de sistema
    const lowerPath = path.toLowerCase();
    if (
      lowerPath.includes("__macosx") ||
      lowerPath.endsWith(".ds_store") ||
      lowerPath.endsWith("thumbs.db")
    ) {
      return;
    }
    
    const ext = path.split(".").pop()?.toLowerCase();
    if (ext && ["pdf", "jpg", "jpeg", "png", "webp"].includes(ext)) {
      entries.push({ path, entry });
    }
  });

  if (entries.length === 0) {
    throw new Error("O ZIP não contém comprovantes válidos.");
  }

  // 2. Criar o lote de análise
  const { data: batch, error: bErr } = await (supabase as any)
    .from("receipt_analysis_batches")
    .insert({
      user_id: userId,
      file_name: file.name,
      files_total: entries.length,
      status: "processing"
    })
    .select("id")
    .single();

  if (bErr || !batch) throw new Error("Erro ao criar lote de análise");

  const progress: AnalysisProgress = {
    filesFound: entries.length,
    filesProcessed: 0,
    alreadyFound: 0,
    notFound: 0,
    needsReview: 0,
    errors: 0,
    percent: 0
  };

  // 3. Processar cada arquivo (Regra 9)
  const processedHashes = new Set<string>();

  for (const { path, entry } of entries) {
    progress.currentFile = path;
    try {
      const blob = await entry.async("blob");
      const buf = await blob.arrayBuffer();
      const hash = await sha256Hex(buf);
      const name = path.split("/").pop() ?? path;
      
      // Regra 34: Duplicidade dentro do próprio ZIP
      if (processedHashes.has(hash)) {
        await (supabase as any).from("receipt_analysis_files").insert({
          batch_id: batch.id,
          user_id: userId,
          original_path: path,
          file_name: name,
          content_hash: hash,
          analysis_status: "duplicate_in_zip",
          analysis_reason: "Arquivo repetido dentro do mesmo ZIP"
        });
        progress.filesProcessed++;
        onProgress({ ...progress });
        continue;
      }
      processedHashes.add(hash);

      // Upload temporário (Regra 49)
      const storagePath = `analysis/${userId}/${batch.id}/${hash.slice(0, 2)}/${hash}-${storageSafeName(name)}`;
      await supabase.storage.from("receipts").upload(storagePath, blob, { upsert: true });

      // Criar registro inicial do arquivo
      const { data: analysisFile, error: fErr } = await (supabase as any)
        .from("receipt_analysis_files")
        .insert({
          batch_id: batch.id,
          user_id: userId,
          original_path: path,
          file_name: name,
          content_hash: hash,
          storage_path: storagePath,
          size_bytes: buf.byteLength,
          analysis_status: "processing"
        })
        .select("id")
        .single();

      if (fErr || !analysisFile) throw fErr;

      // Extração de fatos (OCR estruturado) antes do matching
      const facts = extractReceiptFacts(name); // Nome do arquivo é o primeiro sinal
      
      // Se tivermos texto extraído do processamento prévio ou IA, poderíamos preencher aqui.
      // Por enquanto, garantimos que o registro tenha o mínimo para o findAnalysisCandidates
      await (supabase as any).from("receipt_analysis_files").update({
        amount: facts.amount,
        payment_date: facts.date,
        recipient_name: facts.payee,
        auth_code: facts.auth_code,
        transaction_id: facts.transaction_id
      }).eq("id", analysisFile.id);

      // Executar motor de localização (Regra 11, 38)
      const result = await findAnalysisCandidates({ data: { fileId: analysisFile.id } });

      // Atualizar o registro com o resultado da busca
      await (supabase as any).from("receipt_analysis_files").update({
        analysis_status: result.status,
        candidate_receipt_id: result.candidate_id,
        similarity_score: result.score,
        analysis_reason: result.reason,
        matched_fields: result.matched_fields
      }).eq("id", analysisFile.id);

      if (result.status === "already_posted") progress.alreadyFound++;
      else if (result.status === "possible_match") progress.needsReview++;
      else if (result.status === "not_found") progress.notFound++;

    } catch (e) {
      console.error(e);
      progress.errors++;
    } finally {
      progress.filesProcessed++;
      progress.percent = Math.round((progress.filesProcessed / entries.length) * 100);
      onProgress({ ...progress });
    }
  }

  // Finalizar lote
  await (supabase as any).from("receipt_analysis_batches").update({
    status: "finished",
    files_processed: progress.filesProcessed,
    already_found: progress.alreadyFound,
    not_found: progress.notFound,
    needs_review: progress.needsReview,
    errors: progress.errors,
    finished_at: new Date().toISOString()
  }).eq("id", batch.id);

  return batch.id;
}
