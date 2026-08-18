import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { storageSafeName } from "./zip-import";

export const linkReceiptToAnalysisFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({
    analysisFileId: z.string().uuid(),
    receiptId: z.string().uuid()
  }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // 1. Obter metadados
    const { data: analysisFile } = await (supabase as any)
      .from("receipt_analysis_files")
      .select("*")
      .eq("id", data.analysisFileId)
      .eq("user_id", userId)
      .single();

    if (!analysisFile?.storage_path) throw new Error("Arquivo original não encontrado");

    // 2. Definir destino oficial (receipts/)
    const receiptPath = `receipts/${userId}/${new Date().getFullYear()}/${Date.now()}-${storageSafeName(analysisFile.file_name)}`;

    // 3. Mover no Storage
    const { error: moveErr } = await supabase.storage
      .from("receipts")
      .copy(analysisFile.storage_path, receiptPath);
    
    if (moveErr) throw moveErr;

    // 4. Atualizar lançamento no Cofre
    const { error: updErr } = await supabase
      .from("receipts")
      .update({
        file_path: receiptPath,
        file_hash: analysisFile.content_hash,
        file_mime: analysisFile.mime_type
      })
      .eq("id", data.receiptId)
      .eq("user_id", userId);

    if (updErr) throw updErr;

    // 5. Atualizar status da análise
    await (supabase as any)
      .from("receipt_analysis_files")
      .update({ analysis_status: "already_posted", candidate_receipt_id: data.receiptId })
      .eq("id", data.analysisFileId);

    return { success: true };
  });
