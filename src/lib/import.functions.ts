import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Parte 2 — Classificação e organização pela IA (server functions)
// ---------------------------------------------------------------------------

function normalizeKey(v: unknown): string {
  return String(v ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// ---- 1. Classify one row -------------------------------------------------

export const classifyImportRow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ rowId: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("LOVABLE_API_KEY ausente");

    const { data: row, error } = await supabase
      .from("import_rows")
      .select("*")
      .eq("id", data.rowId)
      .single();
    if (error || !row) throw new Error("Linha não encontrada");

    // Load context: existing categories + user preferences (learned aliases)
    const [{ data: categories }, { data: prefs }] = await Promise.all([
      supabase.from("categories").select("name").eq("user_id", userId),
      supabase
        .from("import_preferences")
        .select("field, raw_key, corrected_value, usage_count")
        .eq("user_id", userId)
        .order("usage_count", { ascending: false })
        .limit(500),
    ]);

    const categoryList = (categories ?? []).map((c: any) => c.name);
    const prefsByField: Record<string, Array<{ from: string; to: string }>> = {};
    for (const p of prefs ?? []) {
      (prefsByField[p.field] ??= []).push({
        from: p.raw_key,
        to: p.corrected_value,
      });
    }

    const promptText = [
      "Você é o assistente de classificação de lançamentos financeiros do Meu Cofre.",
      "Analise TODOS os campos da linha (dados originais, dados normalizados e observações), não apenas a coluna em que a informação aparece.",
      "Um banco, cartão, data, favorecido ou nome de arquivo pode estar descrito dentro das observações — você deve identificar e reorganizar.",
      "",
      "REGRAS OBRIGATÓRIAS:",
      "1. transaction_type é sempre 'DESPESA' ou 'INVESTIMENTO'. NUNCA use 'RECEITA', 'FATURAMENTO' ou 'LUCRO' — o Meu Cofre não trabalha com receitas.",
      "2. Normalize nomes de bancos e cartões para o nome oficial curto: 'Itaú Unibanco S.A.' → 'Itaú'; 'Safra Visa Infinite' → 'Cartão Safra'; 'PortoBank' → 'Porto'.",
      "3. Para categoria, prefira uma já existente do usuário quando fizer sentido. Se realmente não houver equivalente, sugira UMA nova categoria curta.",
      "4. Mantenha SEPARADAS categorias como: Educação × Desporto, APAE × Educação, Caminhão × Caminhonete, Uber × Estacionamento, Serviços × Impostos × Seguros, Compras × Presentes × Vestuário × Tecnologia, Família × Pensão Alimentícia, Despesas × Investimentos.",
      "5. Extraia o final do cartão (últimos 4 dígitos) quando aparecer.",
      "6. Para cada campo preenchido, informe origem (qual coluna original trouxe a informação), confiança (0.0 a 1.0) e uma justificativa curta.",
      "7. Responda APENAS um JSON válido — sem markdown, sem texto extra, sem cercas de código.",
      "",
      "Categorias existentes do usuário: " + JSON.stringify(categoryList),
      "Aliases já aprovados pelo usuário: " + JSON.stringify(prefsByField),
      "",
      "Linha a classificar:",
      JSON.stringify(
        {
          row_number: row.row_number,
          raw_data: row.raw_data,
          normalized_data: row.normalized_data,
          parsed_notes: row.parsed_notes,
        },
        null,
        2,
      ),
      "",
      "Formato de resposta (todos os campos são opcionais; use null quando não houver informação):",
      "{",
      '  "data": {',
      '    "amount": number|null,',
      '    "currency": "BRL"|string|null,',
      '    "date": "YYYY-MM-DD"|null,',
      '    "transaction_type": "DESPESA"|"INVESTIMENTO",',
      '    "category": string|null,',
      '    "subcategory": string|null,',
      '    "description": string|null,',
      '    "payee": string|null,',
      '    "account": string|null,',
      '    "bank": string|null,',
      '    "card": string|null,',
      '    "card_last4": string|null,',
      '    "payment_method": "PIX"|"BOLETO"|"TED"|"DOC"|"DEBITO"|"CREDITO"|"DINHEIRO"|"TRANSFERENCIA"|string|null,',
      '    "holder": string|null,',
      '    "file_name": string|null,',
      '    "folder_path": string|null,',
      '    "source_id": string|null,',
      '    "invoice_number": string|null,',
      '    "page_number": string|null,',
      '    "notes": string|null',
      "  },",
      '  "meta": {',
      '    "<field>": { "original": string|null, "source": string, "confidence": number, "rationale": string }',
      "  }",
      "}",
    ].join("\n");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": key,
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "Responda apenas com JSON válido — sem markdown." },
          { role: "user", content: promptText },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      await supabase
        .from("import_rows")
        .update({ ai_status: "error", ai_error: `Gateway ${res.status}: ${body.slice(0, 300)}` })
        .eq("id", row.id);
      throw new Error(`Gateway ${res.status}: ${body.slice(0, 300)}`);
    }

    const json = await res.json();
    let content: string = json?.choices?.[0]?.message?.content ?? "";
    content = content.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();

    let parsed: { data?: any; meta?: any };
    try {
      parsed = JSON.parse(content);
    } catch {
      await supabase
        .from("import_rows")
        .update({ ai_status: "error", ai_error: "JSON inválido do modelo" })
        .eq("id", row.id);
      throw new Error("Modelo retornou JSON inválido");
    }

    const d = parsed.data ?? {};
    // transaction_type must be DESPESA or INVESTIMENTO — coerce
    let tt: "DESPESA" | "INVESTIMENTO" | null = null;
    const rawTt = String(d.transaction_type ?? "").toUpperCase();
    if (rawTt === "INVESTIMENTO") tt = "INVESTIMENTO";
    else if (rawTt) tt = "DESPESA";

    await supabase
      .from("import_rows")
      .update({
        ai_status: "classified",
        ai_error: null,
        ai_data: d,
        ai_meta: parsed.meta ?? {},
        transaction_type: tt,
        subcategory: d.subcategory ?? null,
        payee: d.payee ?? null,
        bank: d.bank ?? null,
        card: d.card ?? null,
        card_last4: d.card_last4 ?? null,
        payment_method: d.payment_method ?? null,
        holder: d.holder ?? null,
        file_name: d.file_name ?? null,
        folder_path: d.folder_path ?? null,
        source_id: d.source_id ?? null,
        invoice_number: d.invoice_number ?? null,
        page_number: d.page_number ?? null,
        // Update the "reorganized" canonical columns too, without touching raw_data
        amount: typeof d.amount === "number" ? d.amount : row.amount,
        currency: d.currency ?? row.currency,
        transaction_date: d.date ?? row.transaction_date,
        category: d.category ?? row.category,
        account: d.account ?? row.account,
        description: d.description ?? row.description,
        notes: d.notes ?? row.notes,
      })
      .eq("id", row.id);

    return { ok: true as const, rowId: row.id };
  });

// ---- 2. Approve a row: registers learned preferences ---------------------

const ApproveInput = z.object({
  rowId: z.string().uuid(),
  overrides: z
    .object({
      transaction_type: z.enum(["DESPESA", "INVESTIMENTO"]).optional(),
      category: z.string().nullable().optional(),
      subcategory: z.string().nullable().optional(),
      bank: z.string().nullable().optional(),
      card: z.string().nullable().optional(),
      card_last4: z.string().nullable().optional(),
      payment_method: z.string().nullable().optional(),
      payee: z.string().nullable().optional(),
      account: z.string().nullable().optional(),
      description: z.string().nullable().optional(),
      amount: z.number().nullable().optional(),
      currency: z.string().nullable().optional(),
      transaction_date: z.string().nullable().optional(),
      notes: z.string().nullable().optional(),
    })
    .default({}),
});

export const approveImportRow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => ApproveInput.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: row, error } = await supabase
      .from("import_rows")
      .select("*")
      .eq("id", data.rowId)
      .single();
    if (error || !row) throw new Error("Linha não encontrada");

    const patch = { ...data.overrides };

    // Auto-create category if it doesn't exist yet for the user (dedup by normalized name).
    const finalCategory =
      (patch.category as string | null | undefined) ?? row.category ?? null;
    if (finalCategory && finalCategory.trim()) {
      const key = normalizeKey(finalCategory);
      const { data: existing } = await supabase
        .from("categories")
        .select("id, name")
        .eq("user_id", userId);
      const match = (existing ?? []).find(
        (c: any) => normalizeKey(c.name) === key,
      );
      if (!match) {
        await supabase.from("categories").insert({
          user_id: userId,
          name: finalCategory.trim(),
          default_type: "gasto_variavel",
        });
      } else {
        // Snap to the canonical existing name to avoid Educação × EDUCAÇÃO drift.
        patch.category = match.name;
      }
    }

    // Persist row + mark approved
    await supabase
      .from("import_rows")
      .update({
        ...patch,
        review_status: "approved",
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", row.id);

    // Register learned preferences from every user-provided override
    const prefs: Array<{ field: string; from: unknown; to: unknown }> = [
      { field: "bank", from: row.bank, to: patch.bank },
      { field: "card", from: row.card, to: patch.card },
      { field: "category", from: row.category, to: patch.category },
      { field: "payee", from: row.payee, to: patch.payee },
      { field: "payment_method", from: row.payment_method, to: patch.payment_method },
    ];
    for (const p of prefs) {
      const from = normalizeKey(p.from);
      const to = typeof p.to === "string" ? p.to.trim() : "";
      if (!from || !to || normalizeKey(to) === from) continue;
      const { data: existing } = await supabase
        .from("import_preferences")
        .select("id, usage_count")
        .eq("user_id", userId)
        .eq("field", p.field)
        .eq("raw_key", from)
        .maybeSingle();
      if (existing) {
        await supabase
          .from("import_preferences")
          .update({
            corrected_value: to,
            usage_count: (existing.usage_count ?? 1) + 1,
          })
          .eq("id", existing.id);
      } else {
        await supabase.from("import_preferences").insert({
          user_id: userId,
          field: p.field,
          raw_key: from,
          corrected_value: to,
        });
      }
    }

    return { ok: true as const };
  });

export const rejectImportRow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ rowId: z.string().uuid(), reason: z.string().optional() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    await supabase
      .from("import_rows")
      .update({
        review_status: "rejected",
        reviewed_at: new Date().toISOString(),
        ai_error: data.reason ?? null,
      })
      .eq("id", data.rowId);
    return { ok: true as const };
  });

// ---- Set arbitrary review status (ver_depois, pending/undo, save w/o approve)

const StatusInput = z.object({
  rowId: z.string().uuid(),
  status: z.enum(["pending", "approved", "rejected", "ver_depois"]),
  reason: z.string().optional(),
  overrides: z.record(z.string(), z.any()).optional(),
});

export const setImportRowStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => StatusInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const patch: Record<string, unknown> = {
      review_status: data.status,
      reviewed_at: ["pending"].includes(data.status) ? null : new Date().toISOString(),
    };
    if (data.reason !== undefined) patch.ai_error = data.reason;
    if (data.overrides) Object.assign(patch, data.overrides);
    await supabase.from("import_rows").update(patch as any).eq("id", data.rowId);
    return { ok: true as const };
  });