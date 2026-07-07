import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";
import { generateText, Output, NoObjectGeneratedError } from "ai";
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

    // Build message with proper block type
    const isImage = mime.startsWith("image/");
    const contentBlocks: any[] = [
      { type: "text", text: "Extraia com precisão os dados deste comprovante financeiro brasileiro. Devolva apenas o JSON estruturado. Se um campo não estiver visível, use null." },
    ];
    if (isImage) {
      contentBlocks.push({ type: "image", image: `data:${mime};base64,${base64}`, mediaType: mime });
    } else {
      contentBlocks.push({ type: "file", data: `data:${mime};base64,${base64}`, mediaType: mime, filename: rec.file_name ?? "receipt.pdf" });
    }

    const gateway = createLovableAiGatewayProvider(key);
    const model = gateway("google/gemini-2.5-flash");

    let extracted: z.infer<typeof ExtractSchema> | null = null;
    try {
      const { output } = await generateText({
        model,
        output: Output.object({ schema: ExtractSchema }),
        messages: [{ role: "user", content: contentBlocks }],
      });
      extracted = output;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (NoObjectGeneratedError.isInstance(e)) {
        await supabase.from("receipts").update({ ocr_status: "failed", ocr_error: "IA não retornou JSON válido" }).eq("id", rec.id);
      } else {
        await supabase.from("receipts").update({ ocr_status: "failed", ocr_error: msg }).eq("id", rec.id);
      }
      throw new Error(msg);
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
    const { data: prev } = await context.supabase.from("receipts").select("status, profile_id, property_id").eq("id", data.receiptId).single();
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
  .inputValidator((data: unknown) => z.object({ receiptId: z.string().uuid(), reason: z.enum(["rejected", "duplicate"]).default("rejected") }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: prev } = await context.supabase.from("receipts").select("status, profile_id, property_id").eq("id", data.receiptId).single();
    const { error } = await context.supabase.from("receipts").update({ status: data.reason }).eq("id", data.receiptId);
    if (error) throw new Error(error.message);
    await logAudit(context.supabase, context.userId, {
      action: data.reason === "duplicate" ? "marked_duplicate" : "rejected", entity: "receipt", entity_id: data.receiptId,
      profile_id: prev?.profile_id, property_id: prev?.property_id,
      old_value: { status: prev?.status }, new_value: { status: data.reason },
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