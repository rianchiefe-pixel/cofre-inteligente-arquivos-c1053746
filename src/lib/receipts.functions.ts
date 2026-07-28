import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

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
      "payment_date (YYYY-MM-DD ou null), amount (número em reais, use ponto como separador decimal e sem separador de milhar, ou null), recipient_name, recipient_tax_id (só dígitos), bank_name (banco do PAGADOR, conforme regra acima), payment_method (um de: debito, credito_vista, credito_parcelado, pix, ted, boleto, dinheiro, transferencia, outro, ou null), description, auth_code (ID da transação / autenticação / E2E), suggested_category, transaction_type (um de: despesa, investimento, gasto_fixo, gasto_variavel, pessoal, empresarial, patrimonial, ou null).",
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
      if (typeof value === "number" && Number.isFinite(value)) return value;
      if (typeof value !== "string") return null;
      const cleaned = value.replace(/R\$/gi, "").replace(/\s/g, "").trim();
      if (!cleaned) return null;
      const normalized = cleaned.includes(",")
        ? cleaned.replace(/\./g, "").replace(",", ".")
        : cleaned;
      const parsed = Number(normalized.replace(/[^\d.-]/g, ""));
      return Number.isFinite(parsed) ? parsed : null;
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
        await supabase.from("receipts").update({ ocr_status: "failed", ocr_error: "A IA não conseguiu estruturar os dados do comprovante. Revise manualmente." }).eq("id", rec.id);
        return { ok: false, duplicate_of: null, error: "A IA não conseguiu estruturar os dados do comprovante. Revise manualmente." };
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await supabase.from("receipts").update({ ocr_status: "failed", ocr_error: msg }).eq("id", rec.id);
      return { ok: false, duplicate_of: null, error: msg };
    }

    // Look for existing category by name (case-insensitive)
    let category_id: string | null = null;
    if (extracted.suggested_category) {
      const { data: cats } = await supabase
        .from("categories")
        .select("id, name")
        .ilike("name", extracted.suggested_category);
      if (cats && cats.length > 0) category_id = cats[0].id;
    }

    // Recipient recognition & auto-suggestions
    let recipient_id: string | null = null;
    if (extracted.recipient_name) {
      const { data: existing } = await supabase
        .from("recipients")
        .select("id, default_category_id, default_type, default_profile_id, usage_count")
        .ilike("name", extracted.recipient_name)
        .limit(1);
      if (existing && existing.length > 0) {
        const r = existing[0];
        recipient_id = r.id;
        if (!category_id && r.default_category_id) category_id = r.default_category_id;
        await supabase.from("recipients").update({ usage_count: (r.usage_count ?? 0) + 1 }).eq("id", r.id);
      } else {
        const { data: u } = await supabase.auth.getUser();
        const { data: inserted } = await supabase
          .from("recipients")
          .insert({
            user_id: u.user!.id,
            name: extracted.recipient_name,
            tax_id: extracted.recipient_tax_id,
            default_category_id: category_id,
            default_type: extracted.transaction_type ?? "gasto_variavel",
          })
          .select("id")
          .single();
        recipient_id = inserted?.id ?? null;
      }
    }

    // Duplicate detection
    let duplicate_of: string | null = null;
    if (extracted.amount && extracted.payment_date) {
      const { data: dupes } = await supabase
        .from("receipts")
        .select("id")
        .eq("amount", extracted.amount)
        .eq("payment_date", extracted.payment_date)
        .neq("id", rec.id)
        .limit(1);
      if (dupes && dupes.length > 0) duplicate_of = dupes[0].id;
    }
    if (!duplicate_of && extracted.auth_code) {
      const { data: dupes } = await supabase
        .from("receipts")
        .select("id")
        .eq("auth_code", extracted.auth_code)
        .neq("id", rec.id)
        .limit(1);
      if (dupes && dupes.length > 0) duplicate_of = dupes[0].id;
    }
    if (!duplicate_of && rec.file_hash) {
      const { data: dupes } = await supabase
        .from("receipts")
        .select("id")
        .eq("file_hash", rec.file_hash)
        .neq("id", rec.id)
        .limit(1);
      if (dupes && dupes.length > 0) duplicate_of = dupes[0].id;
    }

    // Compute duplicate_score 0..100
    let score = 0;
    if (rec.file_hash) {
      const { data: sameHash } = await supabase.from("receipts").select("id").eq("file_hash", rec.file_hash).neq("id", rec.id).limit(1);
      if (sameHash && sameHash.length) score = Math.max(score, 100);
    }
    if (extracted.auth_code) {
      const { data: sameAuth } = await supabase.from("receipts").select("id").eq("auth_code", extracted.auth_code).neq("id", rec.id).limit(1);
      if (sameAuth && sameAuth.length) score = Math.max(score, 95);
    }
    if (extracted.amount && extracted.payment_date) {
      const { data: sameVD } = await supabase.from("receipts").select("id, recipient_name, bank_name").eq("amount", extracted.amount).eq("payment_date", extracted.payment_date).neq("id", rec.id).limit(3);
      if (sameVD && sameVD.length) {
        let s = 60;
        for (const d of sameVD) {
          if (extracted.recipient_name && d.recipient_name && d.recipient_name.toLowerCase() === extracted.recipient_name.toLowerCase()) s += 15;
          if (extracted.bank_name && d.bank_name && d.bank_name.toLowerCase() === extracted.bank_name.toLowerCase()) s += 10;
        }
        score = Math.max(score, Math.min(s, 90));
      }
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
      category_id,
      recipient_id,
      duplicate_of,
      duplicate_score: score,
      status: duplicate_of ? "duplicate" : "pending",
    };
    const { error: upErr } = await supabase.from("receipts").update(update).eq("id", rec.id);
    if (upErr) throw new Error(upErr.message);

    return { ok: true, duplicate_of };
  });

export const approveReceipt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ receiptId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: prev } = await context.supabase.from("receipts").select("status, profile_id, property_id, notes").eq("id", data.receiptId).single();
    const { error } = await context.supabase
      .from("receipts")
      .update({ status: "approved", approved_at: new Date().toISOString() })
      .eq("id", data.receiptId);
    if (error) throw new Error(error.message);
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
    const { error } = await context.supabase.from("receipts").update({ status: data.reason, notes: data.note ?? prev?.notes ?? null }).eq("id", data.receiptId);
    if (error) throw new Error(error.message);
    await logAudit(context.supabase, context.userId, {
      action: data.reason === "duplicate" ? "marked_duplicate" : "rejected", entity: "receipt", entity_id: data.receiptId,
      profile_id: prev?.profile_id, property_id: prev?.property_id,
      old_value: { status: prev?.status }, new_value: { status: data.reason, note: data.note ?? null }, note: data.note ?? null,
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
    const { error } = await context.supabase.from("receipts").update(patch).in("id", data.receiptIds);
    if (error) throw new Error(error.message);
    for (const id of data.receiptIds) {
      await logAudit(context.supabase, context.userId, {
        action: `bulk_${data.action}`, entity: "receipt", entity_id: id,
        new_value: { status },
      });
    }
    return { ok: true, count: data.receiptIds.length };
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
    const { error } = await context.supabase.from("receipts").update(data.patch as any).in("id", data.receiptIds);
    if (error) throw new Error(error.message);
    for (const id of data.receiptIds) {
      await logAudit(context.supabase, context.userId, {
        action: "bulk_update", entity: "receipt", entity_id: id, new_value: data.patch,
      });
    }
    return { ok: true, count: data.receiptIds.length };
  });

export const deleteReceipts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ receiptIds: z.array(z.string().uuid()).min(1).max(500) }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: rows } = await context.supabase.from("receipts").select("id, file_path").in("id", data.receiptIds);
    const paths = (rows ?? []).map((r: any) => r.file_path).filter(Boolean);
    if (paths.length) await context.supabase.storage.from("receipts").remove(paths);
    const { error } = await context.supabase.from("receipts").delete().in("id", data.receiptIds);
    if (error) throw new Error(error.message);
    for (const id of data.receiptIds) {
      await logAudit(context.supabase, context.userId, {
        action: "deleted", entity: "receipt", entity_id: id,
      });
    }
    return { ok: true, count: data.receiptIds.length };
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
  category_id: z.string().uuid().nullable().optional(),
  description: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  profile_id: z.string().uuid().nullable().optional(),
  property_id: z.string().uuid().nullable().optional(),
  bank_id: z.string().uuid().nullable().optional(),
  account_id: z.string().uuid().nullable().optional(),
}).strict();

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

    const diff: Record<string, any> = {};
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
      .from("receipts").update(diff).eq("id", data.receiptId).select("*").single();
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