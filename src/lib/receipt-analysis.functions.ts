import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/**
 * Busca candidatos a duplicidade no Cofre (receipts) para um arquivo de análise.
 * Não cria nenhum registro, apenas busca.
 */
export const findAnalysisCandidates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({
    fileId: z.string().uuid()
  }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    
    // 1. Carregar os dados do arquivo de análise
    const { data: file, error: fErr } = await supabase
      .from("receipt_analysis_files")
      .select("*")
      .eq("id", data.fileId)
      .eq("user_id", userId)
      .single();
    
    if (fErr || !file) throw new Error("Arquivo de análise não encontrado");

    // 2. Ordem do motor de localização (Regra 38)
    
    // A. SHA-256 exato
    if (file.content_hash) {
      const { data: hashMatch } = await supabase
        .from("receipts")
        .select("id, status")
        .eq("user_id", userId)
        .eq("file_hash", file.content_hash)
        .limit(1);
      
      if (hashMatch?.length) {
        return { 
          status: "already_posted", 
          candidate_id: hashMatch[0].id, 
          score: 100, 
          reason: "Mesmo hash do arquivo",
          matched_fields: ["file_hash"]
        };
      }
    }

    // B. Identificadores Fortes (Auth Code, Transaction ID)
    const strongId = file.auth_code || file.transaction_id;
    if (strongId) {
      const { data: idMatch } = await supabase
        .from("receipts")
        .select("id, status")
        .eq("user_id", userId)
        .or(`auth_code.eq."${strongId}",transaction_id.eq."${strongId}"`)
        .limit(1);
      
      if (idMatch?.length) {
        return { 
          status: "already_posted", 
          candidate_id: idMatch[0].id, 
          score: 95, 
          reason: "Identificador bancário idêntico (Autenticação/ID)",
          matched_fields: ["auth_code"]
        };
      }
    }

    // C. Busca Estruturada (Valor + Data + Nome/CPF)
    if (file.amount && file.payment_date) {
      let query = supabase
        .from("receipts")
        .select("id, status, recipient_name, recipient_tax_id")
        .eq("user_id", userId)
        .eq("amount", file.amount)
        .eq("payment_date", file.payment_date);
      
      const { data: structMatches } = await query.limit(5);
      
      if (structMatches?.length) {
        // Tentar desempate por nome/documento
        for (const m of structMatches) {
          const nameMatch = file.recipient_name && m.recipient_name && 
            m.recipient_name.toLowerCase().includes(file.recipient_name.toLowerCase());
          const taxMatch = file.recipient_tax_id && m.recipient_tax_id === file.recipient_tax_id;
          
          if (taxMatch || nameMatch) {
            return {
              status: "already_posted",
              candidate_id: m.id,
              score: 90,
              reason: "Mesmo valor, data e destinatário",
              matched_fields: ["amount", "payment_date", taxMatch ? "recipient_tax_id" : "recipient_name"]
            };
          }
        }
        
        // Se encontrou valor e data mas não destinatário, é "Possível Correspondência"
        return {
          status: "possible_match",
          candidate_id: structMatches[0].id,
          score: 70,
          reason: "Mesmo valor e data, mas destinatário não confirmado",
          matched_fields: ["amount", "payment_date"]
        };
      }
    }

    // 4. Sem candidato
    return {
      status: "not_found",
      candidate_id: null,
      score: null,
      reason: "Nenhum lançamento correspondente encontrado",
      matched_fields: []
    };
  });

/**
 * Gera um arquivo ZIP contendo apenas os comprovantes "não localizados" selecionados.
 * Regra 31, 32, 33.
 */
export const downloadAnalysisZip = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({
    fileIds: z.array(z.string().uuid())
  }).parse(data))
  .handler(async ({ data, context }) => {
    // Esta função seria idealmente processada no servidor para juntar os arquivos
    // No entanto, para evitar download de muitos MBs no worker, podemos retornar
    // as URLs assinadas e o JSZip faz o trabalho no cliente, ou implementar via API Route.
    // Para simplificar e garantir performance, vamos retornar os metadados necessários.
    const { supabase, userId } = context;
    
    const { data: files, error } = await supabase
      .from("receipt_analysis_files")
      .select("id, original_path, storage_path, analysis_status, file_name")
      .in("id", data.fileIds)
      .eq("user_id", userId)
      .eq("analysis_status", "not_found"); // Regra 33: Validar status no backend
    
    if (error || !files) throw new Error("Erro ao carregar arquivos para download");

    // Gerar URLs assinadas
    const results = [];
    for (const f of files) {
      if (!f.storage_path) continue;
      const { data: signed } = await supabase.storage
        .from("receipts")
        .createSignedUrl(f.storage_path, 3600);
      
      if (signed?.signedUrl) {
        results.push({
          url: signed.signedUrl,
          path: f.original_path,
          name: f.file_name
        });
      }
    }

    return results;
  });
