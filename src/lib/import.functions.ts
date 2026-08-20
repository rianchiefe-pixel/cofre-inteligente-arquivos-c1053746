import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { parseBrlAmount } from "@/lib/format";
import { isCreditCardRow } from "@/lib/import-kind";

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

// Robust JSON extractor for LLM output — strips code fences, isolates the
// outermost JSON object/array, and tolerates trailing commas / control chars.
function extractJson(raw: string): any | null {
  if (!raw) return null;
  let s = raw
    .replace(/^\uFEFF/, "")
    .replace(/^\s*```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
  if (!s.startsWith("{") && !s.startsWith("[")) {
    const o = s.indexOf("{");
    const a = s.indexOf("[");
    const isArr = a !== -1 && (o === -1 || a < o);
    const start = isArr ? a : o;
    const end = isArr ? s.lastIndexOf("]") : s.lastIndexOf("}");
    if (start === -1 || (end !== -1 && end <= start)) return null;
    s = s.slice(start, end !== -1 ? end + 1 : s.length);
  }
  try {
    return JSON.parse(s);
  } catch {}
  try {
    return JSON.parse(
      s.replace(/,\s*}/g, "}").replace(/,\s*]/g, "]").replace(/[\x00-\x1F\x7F]/g, " "),
    );
  } catch {
    return null;
  }
}

// Escolhe o valor monetário correto (sempre positivo) priorizando o texto
// original (amount_raw) sobre o número devolvido pelo modelo — LLMs frequentemente
// interpretam "1.880,00" como 1.88.
function sanitizeAmount(
  raw: unknown,
  numeric: unknown,
  fallback: unknown,
): number | null {
  const fromRaw = parseBrlAmount(raw);
  if (fromRaw !== null && fromRaw > 0) return fromRaw;
  if (typeof numeric === "number" && Number.isFinite(numeric)) {
    return Math.abs(numeric);
  }
  const fromNumericStr = parseBrlAmount(numeric);
  if (fromNumericStr !== null) return fromNumericStr;
  if (typeof fallback === "number" && Number.isFinite(fallback)) {
    return Math.abs(fallback);
  }
  return parseBrlAmount(fallback);
}

// Procura um valor monetário BRL dentro de um texto livre.
function extractBrlFromText(text: string | null | undefined): number | null {
  if (!text) return null;
  const s = String(text);
  // 1) Casos com "R$" + número no padrão BR (com vírgula decimal obrigatória)
  const withCurrency = s.match(/R\$\s*(-?\(?\s*[\d.]+,\d{2}\)?)/i);
  if (withCurrency) {
    const v = parseBrlAmount(withCurrency[1]);
    if (v !== null && v > 0) return v;
  }
  // 2) Qualquer número com vírgula decimal (ex: "1.880,00" ou "15,11")
  const anyDecimal = s.match(/-?\(?\s*\d{1,3}(?:\.\d{3})*,\d{2}\)?/);
  if (anyDecimal) {
    const v = parseBrlAmount(anyDecimal[0]);
    if (v !== null && v > 0) return v;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Sugestão determinística de imóvel a partir do histórico do usuário.
// Regras:
//   - Só sugerimos com evidência real (>=2 usos para payee, >=3 para categoria).
//   - Nunca escolhemos aleatoriamente. Sem evidência → sem sugestão.
//   - Confiança = min(1, usage_count / 4).
// ---------------------------------------------------------------------------

type PrefRow = { field: string; raw_key: string; corrected_value: string; usage_count: number };

export function suggestPropertyForRow(args: {
  payee?: string | null;
  category?: string | null;
  description?: string | null;
  prefs: PrefRow[];
  propertyById: Map<string, any>;
}): {
  ai_property_id: string | null;
  ai_property_confidence: number | null;
  ai_property_reason: string | null;
} {
  const empty = {
    ai_property_id: null,
    ai_property_confidence: null,
    ai_property_reason: null,
  };
  const byPayee = new Map<string, PrefRow>();
  const byCategory = new Map<string, PrefRow>();
  for (const p of args.prefs) {
    if (p.field === "property_link_payee") byPayee.set(p.raw_key, p);
    else if (p.field === "property_link_category") byCategory.set(p.raw_key, p);
  }

  const tryHit = (key: string, source: "favorecido" | "categoria", minUses: number) => {
    const map = source === "favorecido" ? byPayee : byCategory;
    const hit = map.get(key);
    if (!hit) return null;
    const prop = args.propertyById.get(hit.corrected_value);
    if (!prop) return null;
    if (hit.usage_count < minUses) return null;
    return {
      ai_property_id: prop.id as string,
      ai_property_confidence: Math.min(1, hit.usage_count / 4),
      ai_property_reason: `Vinculado ${hit.usage_count}× por ${source} “${key}” → ${prop.name}`,
    };
  };

  const pk = normalizeKey(args.payee);
  if (pk) {
    const hit = tryHit(pk, "favorecido", 2);
    if (hit) return hit;
  }
  const ck = normalizeKey(args.category);
  if (ck) {
    const hit = tryHit(ck, "categoria", 3);
    if (hit) return hit;
  }
  // fallback textual: procura nome de imóvel dentro da descrição.
  const desc = normalizeKey(args.description);
  if (desc) {
    for (const p of args.propertyById.values()) {
      const n = normalizeKey(p.name);
      if (n && n.length >= 4 && desc.includes(n)) {
        return {
          ai_property_id: p.id as string,
          ai_property_confidence: 0.55,
          ai_property_reason: `Nome do imóvel “${p.name}” citado na descrição`,
        };
      }
    }
  }
  return empty;
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
    const [{ data: categories }, { data: prefs }, { data: properties }, { data: banks }] = await Promise.all([
      supabase.from("categories").select("name").eq("user_id", userId),
      supabase
        .from("import_preferences")
        .select("field, raw_key, corrected_value, usage_count")
        .eq("user_id", userId)
        .order("usage_count", { ascending: false })
        .limit(500),
      supabase.from("properties").select("id, name, profile_id").eq("user_id", userId),
      supabase.from("banks").select("name").eq("user_id", userId),
    ]);

    const categoryList = (categories ?? []).map((c: any) => c.name);
    const propertyList = (properties ?? []).map((p: any) => p.name);
    const bankList = (banks ?? []).map((b: any) => b.name);
    const prefsByField: Record<string, Array<{ from: string; to: string }>> = {};
    for (const p of prefs ?? []) {
      (prefsByField[p.field] ??= []).push({
        from: p.raw_key,
        to: p.corrected_value,
      });
    }

    // Load batch scope so we can filter property suggestions by profile.
    const { data: batch } = await supabase
      .from("import_batches")
      .select("profile_id, scope_kind")
      .eq("id", row.batch_id)
      .maybeSingle();
    const eligibleProperties = (properties ?? []).filter((p: any) =>
      batch?.scope_kind === "general" || !batch?.profile_id
        ? true
        : p.profile_id === batch.profile_id,
    );
    const propertyById = new Map<string, any>();
    for (const p of eligibleProperties) propertyById.set(p.id, p);

    const promptText = [
      "Você é o assistente de classificação de lançamentos financeiros do Meu Cofre.",
      "Analise TODOS os campos da linha (dados originais, dados normalizados, descrição e observações). Priorize a PRECISÃO ABSOLUTA acima da automação.",
      "Identifique identificadores únicos como PIX E2E, NSU, ou código de autenticação.",
      'Exemplo: "Pagamento cartão Safra referente a investimento no imóvel Casa 26 para João" → bank: "Safra", payment_method: "CREDITO", property: "Casa 26", payee: "João".',
      "NÃO altere nem reescreva o texto original da descrição — devolva-o inalterado em data.description. Coloque qualquer versão limpa/resumida em data.description_clean.",
      "",
      "REGRAS DE AUDITORIA OBRIGATÓRIAS:",
      "1. É terminantemente proibido supor ou aproximar vínculos. Se houver dúvida, deixe o campo como null.",
      "2. O valor extraído (amount) deve ser idêntico ao que consta no texto/documento. R$ 1.544,00 não é R$ 4,00.",
      "3. transaction_type é sempre 'DESPESA' ou 'INVESTIMENTO'. NUNCA use 'RECEITA'.",
      "4. Normalize nomes de bancos e cartões para o nome oficial curto: 'Itaú Unibanco S.A.' → 'Itaú'.",
      "5. Para categoria, prefira uma já existente do usuário quando fizer sentido.",
      "6. Extraia o final do cartão (últimos 4 dígitos) quando aparecer.",
      "7. Se o texto citar um imóvel, preencha data.property com o nome exato do imóvel.",
      "8. Responda APENAS um JSON válido — sem markdown, sem texto extra.",
      "",
      "Categorias existentes do usuário: " + JSON.stringify(categoryList),
      "Imóveis existentes do usuário: " + JSON.stringify(propertyList),
      "Bancos existentes do usuário: " + JSON.stringify(bankList),
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
      '    "amount": number|null,             // valor POSITIVO em reais (ex: 1880.00 para R$ 1.880,00)',
      '    "amount_raw": string|null,         // valor exatamente como aparece no documento (ex: "R$ 1.880,00")',
      '    "currency": "BRL"|string|null,',
      '    "date": "YYYY-MM-DD"|null,',
      '    "transaction_type": "DESPESA"|"INVESTIMENTO",',
      '    "category": string|null,',
      '    "subcategory": string|null,',
      '    "description": string|null,           // texto ORIGINAL inalterado',
      '    "description_clean": string|null,     // versão limpa/resumida opcional',
      '    "property": string|null,              // nome do imóvel/pessoa/empresa relacionada',
      '    "payee": string|null,',
      '    "account": string|null,',
      '    "bank": string|null,',
      '    "card": string|null,',
      '    "card_last4": string|null,',
      '    "payment_method": "PIX"|"BOLETO"|"TED"|"DOC"|"DEBITO"|"CREDITO"|"DINHEIRO"|"TRANSFERENCIA"|string|null,',
      '    "holder": string|null,',
      '    "notes": string|null',
      "  },",
      '  "meta": {',
      '    "<field>": { "original": string|null, "source": string, "confidence": number, "rationale": string }',
      "  }",
      "}",
      "",
      "REGRA DE VALORES (padrão brasileiro, obrigatório):",
      "- Vírgula = separador decimal. Ponto = separador de milhar.",
      "- 'R$ 1.880,00' significa 1880.00 (mil oitocentos e oitenta reais). NUNCA interprete como 1.88.",
      "- 'R$ 15,11' significa 15.11 (quinze reais e onze centavos). NUNCA como 1511.",
      "- Nunca divida por 100. Nunca remova a vírgula transformando centavos em inteiro.",
      "- amount é SEMPRE positivo. A natureza (DESPESA/INVESTIMENTO) vai em transaction_type, não no sinal.",
      "- Preencha amount_raw com o texto exatamente como aparece na planilha/comprovante.",
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
    const parsed = extractJson(content) as { data?: any; meta?: any } | null;
    if (!parsed) {
      await supabase
        .from("import_rows")
        .update({
          ai_status: "error",
          ai_error: `JSON inválido do modelo: ${(content || "").slice(0, 200)}`,
        })
        .eq("id", row.id);
      return { ok: false as const, reason: "invalid_json" };
    }

    const d = parsed.data ?? {};


    await supabase
      .from("import_rows")
      .update({
        ai_status: "classified",
        ai_error: null,
        ai_data: d,
        ai_meta: parsed.meta ?? {},
        // AI suggestions saved separately (auditable)
        ai_suggested_amount: sanitizeAmount(d.amount_raw, d.amount, row.amount),
        ai_suggested_date: d.date ?? null,
        ai_suggested_payee: d.payee ?? null,
        ai_suggestion_reason: parsed.meta?.data?.rationale ?? null,
        ai_suggestion_confidence:
          typeof parsed.meta?.data?.confidence === "number" ? parsed.meta.data.confidence : null,
        
        ai_category_suggestion:
          d.category && normalizeKey(d.category) !== normalizeKey(row.category ?? "")
            ? d.category
            : null,
        ai_category_confidence:
          typeof parsed.meta?.category?.confidence === "number"
            ? parsed.meta.category.confidence
            : null,
        ai_category_reason: parsed.meta?.category?.rationale ?? null,
        
        // Use suggestPropertyForRow for property suggestion
        ...suggestPropertyForRow({
          payee: d.payee ?? row.payee,
          category: d.category ?? row.category,
          description: row.description,
          prefs: prefs ?? [],
          propertyById,
        }),
      } as any)
      .eq("id", row.id);

    return { ok: true as const, rowId: row.id };
  });

// ---- 2. Approve a row: registers learned preferences ---------------------

// Lista fechada de campos editáveis de uma linha importada. Qualquer chave
// desconhecida é rejeitada (sem mass assignment, sem z.record/z.any).
const RowOverrides = z
  .object({
    transaction_type: z.enum(["DESPESA", "INVESTIMENTO"]).optional(),
    category: z.string().nullable().optional(),
    category_original: z.string().nullable().optional(),
    subcategory: z.string().nullable().optional(),
    bank: z.string().nullable().optional(),
    card: z.string().nullable().optional(),
    card_last4: z.string().nullable().optional(),
    payment_method: z.string().nullable().optional(),
    payee: z.string().nullable().optional(),
    account: z.string().nullable().optional(),
    holder: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    amount: z.number().finite().nullable().optional(),
    currency: z.string().nullable().optional(),
    transaction_date: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
    property_id: z.string().uuid().nullable().optional(),
    general_account: z.boolean().optional(),
  })
  .strict();

export type RowOverridesInput = z.infer<typeof RowOverrides>;

const ApproveInput = z.object({
  rowId: z.string().uuid(),
  overrides: RowOverrides.default({}),
});

const PAYMENT_METHOD_MAP: Record<string, string> = {
  pix: "pix",
  debito: "debito",
  "debito automatico": "debito",
  credito: "credito_vista",
  "credito a vista": "credito_vista",
  "credito vista": "credito_vista",
  "credito parcelado": "credito_parcelado",
  parcelado: "credito_parcelado",
  ted: "ted",
  doc: "ted",
  transferencia: "transferencia",
  transf: "transferencia",
  boleto: "boleto",
  dinheiro: "dinheiro",
  especie: "dinheiro",
  "espécie": "dinheiro",
  outro: "outro",
};

export function normalizePaymentMethod(v: unknown): string | null {
  const key = normalizeKey(v).replace(/[^a-z ]/g, "").trim();
  if (!key) return null;
  return PAYMENT_METHOD_MAP[key] ?? null;
}

// Persiste apenas os campos permitidos na própria linha importada (RLS do usuário).
async function persistRowOverrides(
  db: any,
  rowId: string,
  overrides: RowOverridesInput,
): Promise<void> {
  const patch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined) continue;
    if (k === "transaction_type") {
      patch[k] = typeof v === "string" ? v.toUpperCase() : v;
      continue;
    }
    if (k === "payment_method") {
      patch[k] = v === null ? null : (normalizePaymentMethod(v) ?? String(v));
      continue;
    }
    patch[k] = v;
  }
  if (Object.keys(patch).length === 0) return;
  const { error } = await db.from("import_rows").update(patch).eq("id", rowId);
  if (error) throw new Error(`Falha ao salvar alterações da linha: ${error.message}`);
}

export const approveImportRow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => ApproveInput.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // 1. Carrega dados da linha
    const { data: row, error: rowErr } = await supabase
      .from("import_rows")
      .select("*, batch_id, property_id, payee, category, description, amount, transaction_date, bank, payment_method, notes")
      .eq("id", data.rowId)
      .single();
    if (rowErr || !row) throw new Error("Linha não encontrada");

    // 2. Persiste apenas os campos permitidos na linha (lista fechada)
    await persistRowOverrides(supabase, data.rowId, data.overrides);

    // 3. Resolve categoria pelo nome, sempre no escopo do usuário autenticado
    let categoryId: string | null = null;
    const catName = (data.overrides.category ?? row.category) as string | null;
    if (catName && catName.trim()) {
      const { data: cats, error: catErr } = await supabase
        .from("categories")
        .select("id")
        .eq("user_id", userId)
        .ilike("name", catName.trim());
      if (catErr) throw new Error(catErr.message);
      
      if (cats && cats.length > 0) {
        categoryId = cats[0].id;
      } else {
        const { data: newCat, error: newCatErr } = await supabase
          .from("categories")
          .insert({ user_id: userId, name: catName.trim(), default_type: "gasto_variavel" })
          .select("id")
          .single();
        if (newCatErr || !newCat) throw new Error(newCatErr?.message ?? "Falha ao criar categoria");
        categoryId = newCat.id;
      }
    }

    // 4. Aprovação transacional no banco (deriva usuário, lote, arquivo e perfil)
    const rpcOverrides: Record<string, unknown> = {};
    const o = data.overrides;
    if (o.amount !== undefined && o.amount !== null) rpcOverrides.amount = Math.abs(o.amount);
    if (o.transaction_date !== undefined && o.transaction_date) rpcOverrides.transaction_date = o.transaction_date;
    if (o.payee !== undefined && o.payee !== null) rpcOverrides.payee = o.payee;
    if (o.bank !== undefined && o.bank !== null) rpcOverrides.bank = o.bank;
    if (o.description !== undefined && o.description !== null) rpcOverrides.description = o.description;
    if (o.notes !== undefined && o.notes !== null) rpcOverrides.notes = o.notes;
    if (o.property_id !== undefined) rpcOverrides.property_id = o.property_id;
    if (o.transaction_type !== undefined) {
      rpcOverrides.transaction_type = o.transaction_type === "INVESTIMENTO" ? "investimento" : "despesa";
    }
    const method = normalizePaymentMethod(o.payment_method ?? row.payment_method);
    if (method) rpcOverrides.payment_method = method;
    if (categoryId) rpcOverrides.category_id = categoryId;

    const { data: rpcRows, error: rpcErr } = await supabase.rpc("approve_import_row_rpc", {
      p_row_id: data.rowId,
      p_overrides: rpcOverrides as never,
    });
    if (rpcErr) throw new Error(rpcErr.message);
    const persisted = Array.isArray(rpcRows) ? rpcRows[0] : rpcRows;
    if (!persisted?.receipt_id || persisted.row_review_status !== "approved") {
      throw new Error("A aprovação não foi confirmada pelo banco de dados.");
    }

    const patch = data.overrides;


    // 7. Registra preferências aprendidas a partir de cada override
    const prefs: Array<{ field: string; from: unknown; to: unknown }> = [
      { field: "bank", from: row.bank, to: patch.bank },
      { field: "card", from: row.card, to: patch.card },
      { field: "category", from: row.category, to: patch.category },
      { field: "payee", from: row.payee, to: patch.payee },
      { field: "payment_method", from: row.payment_method, to: patch.payment_method },
    ];

    // Aprende vínculo imóvel↔favorecido/categoria
    const finalProperty = patch.property_id !== undefined ? patch.property_id : row.property_id;
    if (finalProperty) {
      const payeeKey = normalizeKey(patch.payee ?? row.payee);
      const catKey = normalizeKey(patch.category ?? row.category);
      if (payeeKey) prefs.push({ field: "property_link_payee", from: payeeKey, to: finalProperty });
      if (catKey) prefs.push({ field: "property_link_category", from: catKey, to: finalProperty });
    }

    for (const p of prefs) {
      const isPropertyLink = p.field.startsWith("property_link_");
      const from = isPropertyLink ? String(p.from ?? "") : normalizeKey(p.from);
      const to = typeof p.to === "string" ? p.to.trim() : "";
      if (!from || !to) continue;
      if (!isPropertyLink && normalizeKey(to) === from) continue;
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

    return {
      ok: true as const,
      receiptId: persisted.receipt_id as string,
      reviewStatus: persisted.row_review_status as string,
      receiptStatus: persisted.receipt_status as string,
      filePath: persisted.file_path as string,
    };
  });

export const rejectImportRow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ rowId: z.string().uuid(), reason: z.string().optional() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: res, error } = await supabase.rpc("set_import_row_review_rpc", {
      p_row_id: data.rowId,
      p_status: "rejected",
      p_reason: data.reason ?? undefined,
    });
    if (error) throw new Error(error.message);
    const state = Array.isArray(res) ? res[0] : res;
    if (state?.row_review_status !== "rejected") {
      throw new Error("A rejeição não foi confirmada pelo banco de dados.");
    }
    return {
      ok: true as const,
      reviewStatus: state.row_review_status as string,
      receiptStatus: (state.receipt_status ?? null) as string | null,
    };
  });

// ---- Set arbitrary review status (ver_depois, pending/undo, save w/o approve)

const StatusInput = z.object({
  rowId: z.string().uuid(),
  status: z.enum(["pending", "rejected", "ver_depois"]),
  reason: z.string().optional(),
  overrides: RowOverrides.optional(),
});

export const setImportRowStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => StatusInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    if (data.overrides) {
      await persistRowOverrides(supabase, data.rowId, data.overrides);
    }
    const { data: res, error } = await supabase.rpc("set_import_row_review_rpc", {
      p_row_id: data.rowId,
      p_status: data.status,
      p_reason: data.reason ?? undefined,
    });
    if (error) throw new Error(error.message);
    const state = Array.isArray(res) ? res[0] : res;
    if (state?.row_review_status !== data.status) {
      throw new Error("A mudança de estado não foi confirmada pelo banco de dados.");
    }
    return {
      ok: true as const,
      reviewStatus: state.row_review_status as string,
      receiptStatus: (state.receipt_status ?? null) as string | null,
    };
  });

// ---- Reprocessa valores monetários salvos incorretamente ------------------
// Ex.: R$ 1.880,00 gravado como -1.88, R$ 15,11 gravado como -1511.

// ---------------------------------------------------------------------------
// Ações em massa — somente cartões de crédito pendentes
// ---------------------------------------------------------------------------

const BulkInput = z.object({
  batchId: z.string().uuid(),
  rowIds: z.array(z.string().uuid()).min(1).max(2000),
  action: z.enum(["approve", "reject"]),
  reason: z.string().optional(),
});

export const bulkDecideCreditCardRows = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => BulkInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Recarrega no servidor: só linhas do lote informado e ainda pendentes.
    const { data: rows, error: rowsErr } = await supabase
      .from("import_rows")
      .select("id, row_number, batch_id, review_status, category, payment_method, card, card_last4")
      .eq("batch_id", data.batchId)
      .in("id", data.rowIds);
    if (rowsErr) throw new Error(rowsErr.message);

    const eligible = (rows ?? []).filter(
      (r) => (r.review_status ?? "pending") === "pending" && isCreditCardRow(r),
    );
    const skipped = data.rowIds.filter((id) => !eligible.some((r) => r.id === id));

    const done: string[] = [];
    const failed: Array<{ rowId: string; error: string }> = [];
    const categoryCache = new Map<string, string>();

    for (const row of eligible) {
      try {
        if (data.action === "reject") {
          const { data: res, error } = await supabase.rpc("set_import_row_review_rpc", {
            p_row_id: row.id,
            p_status: "rejected",
            p_reason: data.reason ?? "Rejeição em massa — cartões de crédito",
          });
          if (error) throw new Error(error.message);
          const state = Array.isArray(res) ? res[0] : res;
          if (state?.row_review_status !== "rejected") {
            throw new Error("Rejeição não confirmada pelo banco");
          }
        } else {
          const rpcOverrides: Record<string, unknown> = {};
          const method = normalizePaymentMethod(row.payment_method);
          if (method) rpcOverrides.payment_method = method;

          const catName = (row.category ?? "").trim();
          if (catName) {
            const key = normalizeKey(catName);
            let categoryId = categoryCache.get(key) ?? null;
            if (!categoryId) {
            const { data: cats } = await supabase
                .from("categories")
                .select("id")
                .eq("user_id", userId)
                .ilike("name", catName);
              if (cats && cats.length > 0) categoryId = cats[0].id;
              else {
                const { data: newCat, error: newCatErr } = await supabase
                  .from("categories")
                  .insert({ user_id: userId, name: catName, default_type: "gasto_variavel" })
                  .select("id")
                  .single();
                if (newCatErr || !newCat) throw new Error(newCatErr?.message ?? "Falha ao criar categoria");
                categoryId = newCat.id;
              }
              categoryCache.set(key, categoryId);
            }
            rpcOverrides.category_id = categoryId;
          }

          const { data: rpcRows, error: rpcErr } = await supabase.rpc("approve_import_row_rpc", {
            p_row_id: row.id,
            p_overrides: rpcOverrides as never,
          });
          if (rpcErr) throw new Error(rpcErr.message);
          const persisted = Array.isArray(rpcRows) ? rpcRows[0] : rpcRows;
          if (!persisted?.receipt_id || persisted.row_review_status !== "approved") {
            throw new Error("Aprovação não confirmada pelo banco");
          }
        }
        done.push(row.id);
      } catch (e: any) {
        failed.push({
          rowId: row.id,
          error: `Linha ${row.row_number}: ${e?.message ?? "erro desconhecido"}`,
        });
      }
    }

    try {
      await supabase.from("audit_logs").insert({
        user_id: userId,
        action: data.action === "approve" ? "bulk_approve_credit_card_rows" : "bulk_reject_credit_card_rows",
        entity: "import_rows",
        entity_id: data.batchId,
        new_value: {
          batch_id: data.batchId,
          requested: data.rowIds.length,
          processed: done.length,
          failed: failed.length,
          skipped: skipped.length,
          row_ids: done,
          failed_row_ids: failed.map((f) => f.rowId),
          at: new Date().toISOString(),
        } as never,
        note: `Ação em massa (cartões de crédito pendentes): ${done.length} de ${data.rowIds.length} processados`,
      });
    } catch {
      /* auditoria não deve interromper a operação */
    }

    return {
      ok: true as const,
      processed: done.length,
      requested: data.rowIds.length,
      skipped: skipped.length,
      failed,
    };
  });

export const reprocessBatchAmounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ batchId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("import_rows")
      .select("id, amount, ai_data, ai_meta, raw_data, description, notes")
      .eq("batch_id", data.batchId)
      .limit(10000);
    if (error) throw error;

    let updated = 0;
    let scanned = 0;
    for (const r of rows ?? []) {
      scanned++;
      const candidates: unknown[] = [];
      const ai = (r.ai_data ?? {}) as Record<string, any>;
      const meta = (r.ai_meta ?? {}) as Record<string, any>;
      candidates.push(ai.amount_raw);
      candidates.push(meta?.amount?.original);
      // Varredura em raw_data por colunas típicas
      const raw = (r.raw_data ?? {}) as Record<string, any>;
      for (const [k, v] of Object.entries(raw)) {
        if (/valor|amount|montante|quantia|vlr/i.test(k)) candidates.push(v);
      }
      candidates.push(ai.amount);

      let picked: number | null = null;
      for (const c of candidates) {
        const n = parseBrlAmount(c);
        if (n !== null && n > 0) {
          picked = n;
          break;
        }
      }
      // Fallback: procura padrão BRL na descrição / notas
      if (picked === null) {
        picked = extractBrlFromText(r.description) ?? extractBrlFromText(r.notes);
      }

      if (picked === null) continue;
      const current = typeof r.amount === "number" ? Math.abs(r.amount) : NaN;
      // Atualiza quando o valor atual está ausente, negativo, ou diverge do
      // valor recomputado em mais de 1 centavo.
      const differs =
        !Number.isFinite(current) ||
        (r.amount as number) < 0 ||
        Math.abs(current - picked) > 0.01;
      if (!differs) continue;

      await supabase
        .from("import_rows")
        .update({ amount: picked })
        .eq("id", r.id);
      updated++;
    }

    return { ok: true as const, scanned, updated };
  });

// ---- Reaplica sugestão de imóvel (histórico determinístico) --------------

export const reanalyzeBatchProperties = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ batchId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const [{ data: batch }, { data: prefs }, { data: props }, { data: rows }] = await Promise.all([
      supabase
        .from("import_batches")
        .select("profile_id, scope_kind")
        .eq("id", data.batchId)
        .maybeSingle(),
      supabase
        .from("import_preferences")
        .select("field, raw_key, corrected_value, usage_count")
        .eq("user_id", userId)
        .in("field", ["property_link_payee", "property_link_category"])
        .limit(5000),
      supabase.from("properties").select("id, name, profile_id").eq("user_id", userId),
      supabase
        .from("import_rows")
        .select("id, payee, category, description, property_id, review_status")
        .eq("batch_id", data.batchId)
        .limit(20000),
    ]);

    const eligible = (props ?? []).filter((p: any) =>
      batch?.scope_kind === "general" || !batch?.profile_id ? true : p.profile_id === batch.profile_id,
    );
    const propertyById = new Map<string, any>();
    for (const p of eligible) propertyById.set(p.id, p);

    let updated = 0;
    for (const r of rows ?? []) {
      // Nunca sobrescreve escolha manual em linhas aprovadas.
      if (r.review_status === "approved" && r.property_id) continue;
      const s = suggestPropertyForRow({
        payee: r.payee,
        category: r.category,
        description: r.description,
        prefs: prefs ?? [],
        propertyById,
      });
      await supabase
        .from("import_rows")
        .update({
          ai_property_id: s.ai_property_id,
          ai_property_confidence: s.ai_property_confidence,
          ai_property_reason: s.ai_property_reason,
        })
        .eq("id", r.id);
      if (s.ai_property_id) updated++;
    }

    return { ok: true as const, scanned: (rows ?? []).length, suggested: updated };
  });