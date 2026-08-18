import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { centsToNumber, parseBrlAmountToCents } from "@/lib/format";
import { getPayeeHistory } from "./receipt-intelligence";
import { normalizeCategoryName } from "./category-integrity.functions";

async function logAudit(supabase: any, userId: string, params: {
  action: string; entity: string; entity_id?: string | null;
  profile_id?: string | null; property_id?: string | null;
  old_value?: any; new_value?: any; note?: string | null;
}) {
  try {
    await supabase.from("audit_logs").insert({
      user_id: userId,
      action: params.action,
      entity: params.entity,
      entity_id: params.entity_id ?? null,
      profile_id: params.profile_id ?? null,
      property_id: params.property_id ?? null,
      old_value: params.old_value ?? null,
      new_value: params.new_value ?? null,
      note: params.note ?? null,
    });
  } catch { /* audit failures should not break app flow */ }
}

const ExtractSchema = z.object({
  payment_date: z.string().nullable().describe("Data do pagamento no formato YYYY-MM-DD ou null"),
  amount: z.number().nullable().describe("Valor em reais como número (ex 1234.56) ou null"),
  recipient_name: z.string().nullable().describe("Nome do destinatário / beneficiário / favorecido"),
  recipient_tax_id: z.string().nullable().describe("CPF ou CNPJ do destinatário, apenas dígitos"),
  bank_name: z.string().nullable().describe("Banco de origem do pagamento"),
  payment_method: z.enum(["debito","credito_vista","credito_parcelado","pix","ted","boleto","dinheiro","transferencia","outro"]).nullable(),
  description: z.string().nullable().describe("Curta descrição do pagamento"),
  auth_code: z.string().nullable().describe("Código de autenticação / ID transação / E2E"),
  suggested_category: z.string().nullable().describe("Nome da categoria mais provável (ex: Condomínio, Energia, Mercado, Investimentos)"),
  transaction_type: z.enum(["despesa","investimento","gasto_fixo","gasto_variavel","pessoal","empresarial","patrimonial"]).nullable(),
  document_type: z.string().nullable().describe("Tipo do documento: comprovante_pix, transferencia, boleto_pago, compra, fatura, outro"),
});

export const analyzeReceipt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ receiptId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("LOVABLE_API_KEY ausente");

    // Load receipt
    const { data: rec, error } = await supabase.from("receipts").select("*").eq("id", data.receiptId).single();
    if (error || !rec) throw new Error("Comprovante não encontrado");

    if (!rec.file_path) throw new Error("Este lançamento não possui comprovante anexado.");

    await supabase.from("receipts").update({ ocr_status: "processing" }).eq("id", rec.id);

    // Download file as base64
    const { data: file, error: dlErr } = await supabase.storage.from("receipts").download(rec.file_path);
    if (dlErr || !file) {
      await supabase.from("receipts").update({ ocr_status: "failed", ocr_error: dlErr?.message ?? "download falhou" }).eq("id", rec.id);
      throw new Error("Falha ao baixar arquivo");
    }
    const buf = new Uint8Array(await file.arrayBuffer());
    let base64 = "";
    const chunk = 0x8000;
    for (let i = 0; i < buf.length; i += chunk) base64 += String.fromCharCode(...buf.subarray(i, i + chunk));
    base64 = btoa(base64);
    const mime = rec.file_mime ?? "application/octet-stream";

    // The @ai-sdk/openai-compatible converter does not forward `type:"file"` PDF parts to
    // the gateway (it silently drops them), so the model sees only the text prompt and
    // returns nulls. Call the gateway directly with the OpenAI-compatible multimodal
    // shape so PDFs and images both reach Gemini as real content.
    const isImage = mime.startsWith("image/");
    const dataUrl = `data:${mime};base64,${base64}`;
    const promptText = [
      "Você recebe um comprovante financeiro brasileiro (PDF ou imagem). Leia o documento inteiro antes de responder e NÃO invente dados.",
      "",
      "Regra CRÍTICA para bancos e partes envolvidas — leia com atenção:",
      "- O comprovante tem sempre duas partes: o PAGADOR (quem enviou o dinheiro, geralmente sob os rótulos 'De', 'Pagador', 'Origem', 'Débito em', 'Conta debitada', 'Remetente') e o DESTINATÁRIO / FAVORECIDO (quem recebeu, sob 'Para', 'Destinatário', 'Favorecido', 'Beneficiário', 'Crédito em', 'Recebedor').",
      "- 'bank_name' = banco de ORIGEM do pagamento = banco do PAGADOR (a instituição que aparece junto ao bloco 'De/Pagador/Origem', ou o banco que emitiu o próprio comprovante — ex: se o comprovante é do Itaú e mostra o CPF do pagador, o bank_name é 'ITAÚ UNIBANCO S.A.').",
      "- 'recipient_name' e 'recipient_tax_id' = dados do DESTINATÁRIO (bloco 'Para/Favorecido'). NUNCA copie o banco do destinatário para bank_name.",
      "- Se houver dúvida entre dois bancos, escolha o que está associado ao PAGADOR/DÉBITO, não ao crédito.",
      "- Se o banco de origem não estiver claramente visível, retorne null em bank_name — é melhor null do que errado.",
      "",
      "Devolva APENAS um objeto JSON (sem texto fora do JSON, sem markdown) com as chaves:",
      "payment_date (YYYY-MM-DD ou null), amount (número em reais, use ponto como separador decimal e sem separador de milhar, ou null), recipient_name, recipient_tax_id (só dígitos), bank_name (banco do PAGADOR, conforme regra acima), payment_method (um de: debito, credito_vista, credito_parcelado, pix, ted, boleto, dinheiro, transferencia, outro, ou null), description, auth_code (ID da transação / autenticação / E2E), suggested_category, transaction_type (um de: despesa, investimento, gasto_fixo, gasto_variavel, pessoal, empresarial, patrimonial, ou null), document_type (tipo do documento: comprovante_pix, transferencia, boleto_pago, compra, fatura, ou outro).",
      "Se um campo não estiver visível, use null.",
    ].join("\n");
    const userContent: any[] = [{ type: "text", text: promptText }];
    if (isImage) {
      userContent.push({ type: "image_url", image_url: { url: dataUrl } });
    } else {
      userContent.push({ type: "file", file: { filename: rec.file_name ?? "receipt.pdf", file_data: dataUrl } });
    }

    let extracted: z.infer<typeof ExtractSchema> | null = null;
    const normalizeDate = (value: unknown): string | null => {
      if (typeof value !== "string") return null;
      const text = value.trim();
      if (!text) return null;
      const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
      const br = text.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
      if (br) {
        const day = br[1].padStart(2, "0");
        const month = br[2].padStart(2, "0");
        const year = br[3].length === 2 ? `20${br[3]}` : br[3];
        return `${year}-${month}-${day}`;
      }
      return null;
    };
    const normalizeAmount = (value: unknown): number | null => {
      return centsToNumber(parseBrlAmountToCents(value));
    };
    const normalizeString = (value: unknown): string | null => {
      if (typeof value !== "string") return null;
      const text = value.trim();
      return text ? text : null;
    };
    const withoutAccents = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const normalizePaymentMethod = (value: unknown): z.infer<typeof ExtractSchema>["payment_method"] => {
      const text = normalizeString(value);
      if (!text) return null;
      const normalized = withoutAccents(text);
      if (normalized.includes("pix") || normalized.includes("e2e")) return "pix";
      if (normalized.includes("boleto") || normalized.includes("codigo de barras")) return "boleto";
      if (normalized.includes("ted")) return "ted";
      if (normalized.includes("deb")) return "debito";
      if (normalized.includes("parcel")) return "credito_parcelado";
      if (normalized.includes("cred")) return "credito_vista";
      if (normalized.includes("dinheiro") || normalized.includes("especie")) return "dinheiro";
      if (normalized.includes("transf") || normalized.includes("doc")) return "transferencia";
      return "outro";
    };
    const normalizeTransactionType = (value: unknown): z.infer<typeof ExtractSchema>["transaction_type"] => {
      const text = normalizeString(value);
      if (!text) return null;
      const normalized = withoutAccents(text).replace(/[\s-]+/g, "_");
      if (normalized.includes("invest")) return "investimento";
      if (normalized.includes("fix")) return "gasto_fixo";
      if (normalized.includes("vari")) return "gasto_variavel";
      if (normalized.includes("pessoal")) return "pessoal";
      if (normalized.includes("empresa")) return "empresarial";
      if (normalized.includes("patrim")) return "patrimonial";
      if (normalized.includes("desp")) return "despesa";
      return null;
    };
    const normalizeExtracted = (raw: Record<string, unknown>): z.infer<typeof ExtractSchema> => ({
      payment_date: normalizeDate(raw.payment_date ?? raw.data_pagamento ?? raw.data),
      amount: normalizeAmount(raw.amount ?? raw.valor ?? raw.valor_pago),
      recipient_name: normalizeString(raw.recipient_name ?? raw.beneficiario ?? raw.favorecido ?? raw.destinatario),
      recipient_tax_id: normalizeString(raw.recipient_tax_id ?? raw.cpf_cnpj ?? raw.documento)?.replace(/\D/g, "") || null,
      bank_name: normalizeString(raw.bank_name ?? raw.banco),
      payment_method: normalizePaymentMethod(raw.payment_method ?? raw.metodo_pagamento ?? raw.forma_pagamento),
      description: normalizeString(raw.description ?? raw.descricao ?? raw.historico),
      auth_code: normalizeString(raw.auth_code ?? raw.codigo_autenticacao ?? raw.id_transacao ?? raw.e2e),
      suggested_category: normalizeString(raw.suggested_category ?? raw.categoria_sugerida ?? raw.categoria),
      transaction_type: normalizeTransactionType(raw.transaction_type ?? raw.tipo_transacao ?? raw.tipo),
      document_type: normalizeString(raw.document_type ?? raw.tipo_documento),
    });
    const parseGeneratedJson = (raw: string | undefined): z.infer<typeof ExtractSchema> | null => {
      if (!raw) return null;
      let cleaned = raw
        .replace(/^```json\s*/im, "")
        .replace(/^```\s*/im, "")
        .replace(/```\s*$/im, "")
        .trim();
      if (!cleaned.startsWith("{") && !cleaned.startsWith("[")) {
        const objStart = cleaned.indexOf("{");
        const arrStart = cleaned.indexOf("[");
        const isArray = arrStart !== -1 && (objStart === -1 || arrStart < objStart);
        const start = isArray ? arrStart : objStart;
        const end = isArray ? cleaned.lastIndexOf("]") : cleaned.lastIndexOf("}");
        if (start === -1 || end <= start) return null;
        cleaned = cleaned.slice(start, end + 1);
      }
      try {
        const parsed = JSON.parse(cleaned);
        const obj = Array.isArray(parsed) ? parsed[0] : parsed;
        if (!obj || typeof obj !== "object") return null;
        return normalizeExtracted(obj as Record<string, unknown>);
      } catch {
        return null;
      }
    };
    try {
      const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Lovable-API-Key": key,
          "X-Lovable-AIG-SDK": "vercel-ai-sdk",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [{ role: "user", content: userContent }],
          response_format: { type: "json_object" },
        }),
      });
      if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        throw new Error(`Gateway ${resp.status}: ${text.slice(0, 300)}`);
      }
      const json: any = await resp.json();
      const raw: string | undefined = json?.choices?.[0]?.message?.content;
      extracted = parseGeneratedJson(raw);
      if (!extracted) {
        const errorMsg = "A IA não conseguiu estruturar os dados do comprovante. Revise manualmente.";
        await supabase.from("receipts").update({ 
          ocr_status: "failed", 
          ocr_error: errorMsg,
          ai_confidence: "NAO_IDENTIFICADO",
          ai_reason: errorMsg
        }).eq("id", rec.id);
        return { ok: false, duplicate_of: null, error: errorMsg };
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      let userFriendlyMsg = "Falha técnica na análise (Gateway/Créditos). O comprovante foi preservado.";
      
      if (msg.includes("credits") || msg.includes("402")) {
        userFriendlyMsg = "Limite de processamento de IA atingido para este período. O comprovante foi salvo e pode ser conferido manualmente.";
      }

      await supabase.from("receipts").update({ 
        ocr_status: "failed", 
        ocr_error: msg,
        ai_confidence: "NAO_IDENTIFICADO",
        ai_reason: userFriendlyMsg
      }).eq("id", rec.id);
      return { ok: false, duplicate_of: null, error: msg };
    }


    // Intelligence Layer: Historical matching & Suggestions
    let ai_suggested_category_id: string | null = null;
    let ai_suggested_profile_id: string | null = rec.profile_id; // Default to current profile
    let ai_confidence: "ALTA" | "MEDIA" | "BAIXA" | "NAO_IDENTIFICADO" = "NAO_IDENTIFICADO";
    let ai_reason = "";
    let historySummary: any = null;

    if (extracted.recipient_name) {
      historySummary = await getPayeeHistory({
        userId: context.userId,
        payeeName: extracted.recipient_name,
        taxId: extracted.recipient_tax_id,
        supabase
      });

      if (historySummary && historySummary.count > 0) {
        // Find most frequent category
        const sortedCats = Object.entries(historySummary.categories as Record<string, number>)
          .sort((a, b) => b[1] - a[1]);
        const mostFreqCat = sortedCats[0];

        // Find most frequent profile
        const sortedProfs = Object.entries(historySummary.profiles as Record<string, number>)
          .sort((a, b) => b[1] - a[1]);
        const mostFreqProf = sortedProfs[0];

        if (mostFreqCat) ai_suggested_category_id = mostFreqCat[0];
        if (mostFreqProf) ai_suggested_profile_id = mostFreqProf[0];

        // Scoring Confidence
        const catConsistency = mostFreqCat ? mostFreqCat[1] / historySummary.count : 0;
        const profConsistency = mostFreqProf ? mostFreqProf[1] / historySummary.count : 0;

        if (historySummary.count >= 5 && catConsistency >= 0.8 && profConsistency >= 0.8) {
          ai_confidence = "ALTA";
          ai_reason = `${historySummary.count} transações anteriores deste favorecido foram classificadas como tal nos perfis indicados.`;
        } else if (historySummary.count >= 2) {
          ai_confidence = "MEDIA";
          ai_reason = "Existe histórico semelhante, mas com alguma variação nas classificações anteriores.";
        } else {
          ai_confidence = "BAIXA";
          ai_reason = "Favorecido encontrado poucas vezes no histórico.";
        }
      } else {
        ai_confidence = "BAIXA";
        ai_reason = "Favorecido sem histórico anterior no Meu Cofre.";
      }
    } else {
      ai_reason = "Não foi possível identificar o favorecido com segurança no comprovante.";
    }

    // Recipient recognition (sync with intelligence)
    let recipient_id: string | null = null;
    if (extracted.recipient_name) {
      const normalizedNewName = normalizeCategoryName(extracted.recipient_name);
      const { data: allRecipients } = await supabase
        .from("recipients")
        .select("id, name, default_category_id, usage_count")
        .eq("user_id", context.userId);
      
      const existing = allRecipients?.filter((r: any) => 
        normalizeCategoryName(r.name) === normalizedNewName
      ) || [];

      if (existing.length > 0) {
        // Encontrou por normalização (previne duplicidade textual/case)
        const r = existing.sort((a: any, b: any) => (b.usage_count || 0) - (a.usage_count || 0))[0];
        recipient_id = r.id;
        if (!ai_suggested_category_id && r.default_category_id) ai_suggested_category_id = r.default_category_id;
        await supabase.from("recipients").update({ usage_count: (r.usage_count ?? 0) + 1 }).eq("id", r.id);
      } else {
        const { data: inserted } = await supabase
          .from("recipients")
          .insert({
            user_id: context.userId,
            name: extracted.recipient_name,
            tax_id: extracted.recipient_tax_id,
            default_category_id: ai_suggested_category_id,
            default_type: extracted.transaction_type ?? "gasto_variavel",
          })
          .select("id")
          .single();
        recipient_id = inserted?.id ?? null;
      }
    }

    // Duplicate detection engine v3 (Strict Candidate Enforcement)
    let duplicate_of: string | null = null;
    let score = 0;
    const matchedFields: string[] = [];
    const differentFields: string[] = [];

    // 1. Exact file hash (100%)
    if (rec.file_hash) {
      const { data: sameHash } = await supabase
        .from("receipts")
        .select("id")
        .eq("file_hash", rec.file_hash)
        .neq("id", rec.id)
        .limit(1);
      if (sameHash?.length) { 
        duplicate_of = sameHash[0].id; 
        score = 100;
        matchedFields.push("file_hash");
      }
    }

    // 2. Strong Identifiers (Auth Code, Pix E2E, NSU)
    if (!duplicate_of && extracted.auth_code) {
      const { data: sameAuth } = await supabase
        .from("receipts")
        .select("id")
        .eq("auth_code", extracted.auth_code)
        .neq("id", rec.id)
        .limit(1);
      if (sameAuth?.length) { 
        duplicate_of = sameAuth[0].id; 
        score = 95;
        matchedFields.push("auth_code");
      }
    }

    // 3. Multi-factor detection (Amount + Date + Payee/Bank)
    if (!duplicate_of && extracted.amount && extracted.payment_date) {
      // Searching all receipts, with or without files
      const { data: candidates } = await supabase
        .from("receipts")
        .select("id, amount, payment_date, recipient_name, bank_name, auth_code, recipient_tax_id")
        .eq("amount", extracted.amount)
        .eq("payment_date", extracted.payment_date)
        .neq("id", rec.id)
        .limit(10);

      if (candidates?.length) {
        for (const cand of candidates) {
          let candScore = 40; // Base for same Amount + Date
          const candMatched: string[] = ["amount", "payment_date"];
          const candDifferent: string[] = [];

          const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().trim();
          
          if (extracted.recipient_name && cand.recipient_name && norm(extracted.recipient_name) === norm(cand.recipient_name)) {
            candScore += 25;
            candMatched.push("recipient_name");
          } else if (extracted.recipient_name && cand.recipient_name) {
            candDifferent.push("recipient_name");
          }

          if (extracted.bank_name && cand.bank_name && norm(extracted.bank_name) === norm(cand.bank_name)) {
            candScore += 15;
            candMatched.push("bank_name");
          } else if (extracted.bank_name && cand.bank_name) {
            candDifferent.push("bank_name");
          }

          if (extracted.recipient_tax_id && extracted.recipient_tax_id === cand.recipient_tax_id) {
            candScore += 20;
            candMatched.push("recipient_tax_id");
          }

          // Strict threshold for automatic flag
          if (candScore >= 60) {
            duplicate_of = cand.id;
            score = Math.min(candScore, 90);
            matchedFields.push(...candMatched);
            differentFields.push(...candDifferent);
            break;
          }
        }
      }
    }

    // Score Integrity: If no candidate identified, score MUST be 0
    if (!duplicate_of) {
      score = 0;
    }


    // Persist detailed duplicate check
    if (duplicate_of) {
      await supabase.from("duplicate_checks").insert({
        user_id: context.userId,
        new_receipt_id: rec.id,
        candidate_receipt_id: duplicate_of,
        similarity_score: score,
        matched_fields: Array.from(new Set(matchedFields)),
        different_fields: Array.from(new Set(differentFields)),
        status: "pending"
      });
    }

    const update: any = {
      ocr_status: "done",
      ocr_data: extracted,
      payment_date: extracted.payment_date,
      amount: extracted.amount,
      recipient_name: extracted.recipient_name,
      recipient_tax_id: extracted.recipient_tax_id,
      bank_name: extracted.bank_name,
      payment_method: extracted.payment_method,
      description: extracted.description,
      auth_code: extracted.auth_code,
      transaction_type: extracted.transaction_type,
      category_id: ai_suggested_category_id, // Initial suggestion
      recipient_id,
      duplicate_of,
      duplicate_score: score,
      status: duplicate_of ? "duplicate" : "pending",
      // New fields
      ai_confidence,
      ai_reason,
      ai_suggested_category_id,
      ai_suggested_profile_id,
      ai_extracted_data: extracted,
      ai_history_summary: historySummary,
    };
    const { error: upErr } = await supabase.from("receipts").update(update).eq("id", rec.id);
    if (upErr) {
      console.error(`ERRO RLS/DB ao atualizar receipt ${rec.id}:`, upErr);
      throw new Error(`Erro ao salvar análise: ${upErr.message} (Verifique as permissões de RLS para o perfil ${update.profile_id})`);
    }

    return { ok: true, duplicate_of };
  });


export const approveReceipt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ receiptId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: prev } = await context.supabase.from("receipts").select("status, profile_id, property_id, notes").eq("id", data.receiptId).single();
    const { data: updated, error } = await context.supabase
      .from("receipts")
      .update({ 
        status: "approved", 
        approved_at: new Date().toISOString(),
        user_confirmed_at: new Date().toISOString()
      })
      .eq("id", data.receiptId)
      .select("id");
    if (error) throw new Error(error.message);
    if (!updated?.length) throw new Error("Comprovante não encontrado ou sem permissão para aprovar.");
    await logAudit(context.supabase, context.userId, {
      action: "approved", entity: "receipt", entity_id: data.receiptId,
      profile_id: prev?.profile_id, property_id: prev?.property_id,
      old_value: { status: prev?.status }, new_value: { status: "approved" },
    });
    return { ok: true };
  });

export const rejectReceipt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ receiptId: z.string().uuid(), reason: z.enum(["rejected", "duplicate"]).default("rejected"), note: z.string().optional() }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: prev } = await context.supabase.from("receipts").select("status, profile_id, property_id, notes").eq("id", data.receiptId).single();
    const { data: updated, error } = await context.supabase
      .from("receipts")
      .update({ status: data.reason, notes: data.note ?? prev?.notes ?? null })
      .eq("id", data.receiptId)
      .select("id");
    if (error) throw new Error(error.message);
    if (!updated?.length) throw new Error("Comprovante não encontrado ou sem permissão para alterar.");
    await logAudit(context.supabase, context.userId, {
      action: data.reason === "duplicate" ? "marked_duplicate" : "rejected", entity: "receipt", entity_id: data.receiptId,
      profile_id: prev?.profile_id, property_id: prev?.property_id,
      old_value: { status: prev?.status }, new_value: { status: data.reason, note: data.note ?? null }, note: data.note ?? null,
    });
    return { ok: true };
  });

export const archiveReceipt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ receiptId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: prev } = await context.supabase.from("receipts").select("status, profile_id, property_id").eq("id", data.receiptId).single();
    const { data: updated, error } = await context.supabase
      .from("receipts")
      .update({ status: "archived" })
      .eq("id", data.receiptId)
      .select("id");
    if (error) throw new Error(error.message);
    if (!updated?.length) throw new Error("Comprovante não encontrado ou sem permissão para arquivar.");
    await logAudit(context.supabase, context.userId, {
      action: "receipt_archived", entity: "receipt", entity_id: data.receiptId,
      profile_id: prev?.profile_id, property_id: prev?.property_id,
      old_value: { status: prev?.status }, new_value: { status: "archived" },
    });
    return { ok: true };
  });

export const bulkReceiptAction = createServerFn({ method: "POST" })

  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({
    receiptIds: z.array(z.string().uuid()).min(1).max(500),
    action: z.enum(["approve", "reject", "duplicate", "archive"]),
  }).parse(data))
  .handler(async ({ data, context }) => {
    const map = { approve: "approved", reject: "rejected", duplicate: "duplicate", archive: "archived" } as const;
    const status = map[data.action];
    const patch: any = { status };
    if (data.action === "approve") patch.approved_at = new Date().toISOString();
    const { data: updated, error } = await context.supabase
      .from("receipts")
      .update(patch)
      .in("id", data.receiptIds)
      .select("id");
    if (error) throw new Error(error.message);
    const changedIds = (updated ?? []).map((r) => r.id);
    if (changedIds.length === 0) {
      throw new Error("Nenhum comprovante foi alterado. Verifique suas permissões.");
    }
    for (const id of changedIds) {
      await logAudit(context.supabase, context.userId, {
        action: `bulk_${data.action}`, entity: "receipt", entity_id: id,
        new_value: { status },
      });
    }
    return {
      ok: true,
      count: changedIds.length,
      requested: data.receiptIds.length,
      skipped: data.receiptIds.length - changedIds.length,
      ids: changedIds,
    };
  });

export const bulkUpdateReceipts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({
    receiptIds: z.array(z.string().uuid()).min(1).max(500),
    patch: z.object({
      category_id: z.string().uuid().nullable().optional(),
      profile_id: z.string().uuid().nullable().optional(),
      bank_id: z.string().uuid().nullable().optional(),
      account_id: z.string().uuid().nullable().optional(),
      property_id: z.string().uuid().nullable().optional(),
      transaction_type: z.enum(["despesa","investimento","gasto_fixo","gasto_variavel","pessoal","empresarial","patrimonial"]).nullable().optional(),
    }),
  }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: updated, error } = await context.supabase
      .from("receipts")
      .update(data.patch as any)
      .in("id", data.receiptIds)
      .select("id");
    if (error) throw new Error(error.message);
    const changedIds = (updated ?? []).map((r) => r.id);
    if (changedIds.length === 0) {
      throw new Error("Nenhum comprovante foi alterado. Verifique suas permissões.");
    }
    for (const id of changedIds) {
      await logAudit(context.supabase, context.userId, {
        action: "bulk_update", entity: "receipt", entity_id: id, new_value: data.patch,
      });
    }
    return {
      ok: true,
      count: changedIds.length,
      requested: data.receiptIds.length,
      skipped: data.receiptIds.length - changedIds.length,
      ids: changedIds,
    };
  });

export const deleteReceipts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ receiptIds: z.array(z.string().uuid()).min(1).max(500) }).parse(data))
  .handler(async ({ data, context }) => {
    // 1) Exclusão transacional no banco (RPC verifica propriedade e grava auditoria).
    //    O Storage só é tocado DEPOIS que o banco confirmou a remoção.
    const { data: result, error } = await context.supabase.rpc("delete_receipts_safely", {
      p_receipt_ids: data.receiptIds,
    });
    if (error) throw new Error(error.message);

    const deleted = (result ?? []) as Array<{ deleted_id: string; safe_file_path: string | null }>;
    if (deleted.length === 0) {
      throw new Error("Nenhum comprovante encontrado ou sem permissão para excluir.");
    }

    // 2) Apaga apenas arquivos que não são referenciados por outros comprovantes/importações.
    const paths = Array.from(
      new Set(deleted.map((r) => r.safe_file_path).filter((p): p is string => !!p)),
    );
    let storageWarning: string | null = null;
    if (paths.length) {
      const { error: storageErr } = await context.supabase.storage.from("receipts").remove(paths);
      if (storageErr) {
        // Falha no Storage NÃO reverte a exclusão no banco; apenas informa e audita.
        storageWarning = storageErr.message;
        console.error("[deleteReceipts] falha ao remover arquivos do Storage:", storageErr.message);
        await logAudit(context.supabase, context.userId, {
          action: "deleted",
          entity: "receipt_file",
          note: `Arquivos não removidos do armazenamento: ${paths.join(", ")} (${storageErr.message})`,
        });
      }
    }

    return {
      ok: true,
      count: deleted.length,
      filesRemoved: storageWarning ? 0 : paths.length,
      filesKept: deleted.length - paths.length,
      storageWarning,
    };
  });

const paymentMethodEnum = z.enum(["debito","credito_vista","credito_parcelado","pix","ted","boleto","dinheiro","transferencia","outro"]);
const transactionTypeEnum = z.enum(["despesa","investimento","gasto_fixo","gasto_variavel","pessoal","empresarial","patrimonial"]);

const ConferencePatchSchema = z.object({
  payment_date: z.string().nullable().optional(),
  amount: z.number().nullable().optional(),
  recipient_name: z.string().nullable().optional(),
  recipient_tax_id: z.string().nullable().optional(),
  bank_name: z.string().nullable().optional(),
  auth_code: z.string().nullable().optional(),
  payment_method: paymentMethodEnum.nullable().optional(),
  transaction_type: transactionTypeEnum.nullable().optional(),
  expense_behavior: z.string().nullable().optional(),
  category_id: z.string().uuid().nullable().optional(),
  description: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  profile_id: z.string().uuid().nullable().optional(),
  property_id: z.string().uuid().nullable().optional(),
  bank_id: z.string().uuid().nullable().optional(),
  account_id: z.string().uuid().nullable().optional(),
}).strict();

export const mergeReceipts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({
    sourceId: z.string().uuid(),
    targetId: z.string().uuid(),
    selections: z.record(z.string(), z.enum(["source", "target"])).optional(),
  }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Load both receipts
    const { data: source } = await supabase.from("receipts").select("*").eq("id", data.sourceId).single();
    const { data: target } = await supabase.from("receipts").select("*").eq("id", data.targetId).single();

    if (!source || !target) throw new Error("Um ou ambos os comprovantes não foram encontrados.");
    if (source.user_id !== userId || target.user_id !== userId) throw new Error("Sem permissão para mesclar estes comprovantes.");

    // Smart merge logic
    const merged: Record<string, any> = {
      updated_at: new Date().toISOString(),
      user_confirmed_at: new Date().toISOString(),
      status: "approved",
    };

    const fieldsToMerge = [
      "payment_date", "amount", "recipient_name", "recipient_tax_id", 
      "bank_name", "auth_code", "payment_method", "transaction_type", 
      "expense_behavior", "category_id", "description", "notes", 
      "profile_id", "property_id", "bank_id", "account_id", "file_path", 
      "file_name", "file_mime", "file_size", "file_hash", "ocr_data"
    ];

    for (const field of fieldsToMerge) {
      const selection = data.selections?.[field];
      const sourceVal = (source as any)[field];
      const targetVal = (target as any)[field];
      
      if (selection === "source") {
        merged[field] = sourceVal;
      } else if (selection === "target") {
        merged[field] = targetVal;
      } else {
        // Default: use non-null value, prioritize target (existing) if both exist
        merged[field] = targetVal ?? sourceVal;
      }
    }

    // Update target and delete source
    const { error: upErr } = await supabase.from("receipts").update(merged as any).eq("id", data.targetId);
    if (upErr) throw new Error(`Erro ao atualizar registro: ${upErr.message}`);

    const { error: delErr } = await supabase.from("receipts").delete().eq("id", data.sourceId);
    if (delErr) {
      console.error("Erro ao deletar origem após mesclagem:", delErr);
      // Not fatal but should be logged
    }

    // Mark duplicate check as merged
    await supabase.from("duplicate_checks")
      .update({ status: "merged", reviewed_at: new Date().toISOString(), reviewed_by: userId })
      .or(`new_receipt_id.eq.${data.sourceId},candidate_receipt_id.eq.${data.sourceId}`);

    await logAudit(supabase, userId, {
      action: "receipt_merged",
      entity: "receipt",
      entity_id: data.targetId,
      profile_id: merged.profile_id,
      note: `Lançamento ${data.sourceId} mesclado em ${data.targetId}`
    });

    return { ok: true, targetId: data.targetId };
  });

export const markAsNotDuplicate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({
    receiptId: z.string().uuid(),
    candidateId: z.string().uuid().optional(),
  }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    if (data.candidateId) {
      await supabase.from("duplicate_checks")
        .update({ 
          status: "not_duplicate", 
          reviewed_at: new Date().toISOString(), 
          reviewed_by: userId 
        })
        .eq("new_receipt_id", data.receiptId)
        .eq("candidate_receipt_id", data.candidateId);
    }

    // Clear duplicate flags in the receipt
    await supabase.from("receipts")
      .update({ 
        duplicate_of: null, 
        duplicate_score: 0,
        status: "pending" 
      })
      .eq("id", data.receiptId)
      .eq("user_id", userId);

    return { ok: true };
  });

export const reconcileDuplicates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    // Find inconsistent receipts: has score but no candidate
    const { data: inconsistent } = await supabase
      .from("receipts")
      .select("id, duplicate_score, duplicate_of")
      .eq("user_id", userId)
      .gt("duplicate_score", 0)
      .is("duplicate_of", null);

    let fixedCount = 0;
    if (inconsistent?.length) {
      for (const rec of inconsistent) {
        // Check if there's a record in duplicate_checks we can recover
        const { data: check } = await supabase
          .from("duplicate_checks")
          .select("candidate_receipt_id")
          .eq("new_receipt_id", rec.id)
          .order("similarity_score", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (check?.candidate_receipt_id) {
          await supabase.from("receipts")
            .update({ duplicate_of: check.candidate_receipt_id })
            .eq("id", rec.id);
        } else {
          // No recovery possible, clear flags
          await supabase.from("receipts")
            .update({ duplicate_score: 0, status: "pending" })
            .eq("id", rec.id);
          fixedCount++;
        }
      }
    }

    return { ok: true, reconciled: inconsistent?.length ?? 0, cleared: fixedCount };
  });


export const updateReceiptConference = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({
    receiptId: z.string().uuid(),
    patch: ConferencePatchSchema,
  }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: existing, error: loadErr } = await supabase
      .from("receipts").select("*").eq("id", data.receiptId).single();
    if (loadErr || !existing) throw new Error("Comprovante não encontrado");
    if ((existing as any).user_id !== userId) {
      throw new Error("Sem permissão para editar este comprovante");
    }

    const diff: Record<string, any> = {
      user_confirmed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      is_manual_correction: true
    };
    const oldValues: Record<string, any> = {};
    for (const [k, v] of Object.entries(data.patch)) {
      if (v === undefined) continue;
      const current = (existing as any)[k];
      const normalizedCurrent = current === undefined ? null : current;
      const normalizedNext = v === undefined ? null : v;
      if (normalizedCurrent !== normalizedNext) {
        diff[k] = v;
        oldValues[k] = normalizedCurrent;
      }
    }

    if (Object.keys(diff).length === 0) {
      return { ok: true, receipt: existing, changed: [] as string[] };
    }

    const { data: updated, error: upErr } = await supabase
      .from("receipts").update(diff as any).eq("id", data.receiptId).select("*").single();
    if (upErr) throw new Error(upErr.message);

    await logAudit(supabase, userId, {
      action: "conference_updated",
      entity: "receipt",
      entity_id: data.receiptId,
      profile_id: (updated as any)?.profile_id ?? (existing as any).profile_id,
      property_id: (updated as any)?.property_id ?? (existing as any).property_id,
      old_value: oldValues,
      new_value: diff,
    });

    return { ok: true, receipt: updated, changed: Object.keys(diff) };
  });