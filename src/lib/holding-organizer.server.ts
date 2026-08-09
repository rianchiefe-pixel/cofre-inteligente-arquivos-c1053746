// Lógica de servidor da organização da Advocacia Liliane Pereira.
// Nunca altera perfil, valor ou data: apenas categoria, imóvel e centro de custo.
import {
  ADVOCACIA_COST_CENTER,
  ADVOCACIA_RULE_NAME,
  ADVOCACIA_TAXONOMY,
  ADVOCACIA_TERMS,
  classifyAdvocaciaReceipt,
  findExistingProperty,
  normalizeText,
  propertyNameFromHint,
  type AdvocaciaSuggestion,
  type Confidence,
  type OrganizerReceipt,
} from "./advocacia-organizer";

type Client = any;

export type OrganizerContext = {
  profile: { id: string; name: string; type: string };
  receipts: (OrganizerReceipt & { status: string })[];
  suggestions: Map<string, AdvocaciaSuggestion>;
  categories: { id: string; name: string; parent_id: string | null }[];
  costCenters: { id: string; name: string }[];
  properties: { id: string; name: string; address: string | null; registration: string | null }[];
};

export type OrganizerPlanItem = {
  receiptId: string;
  paymentDate: string | null;
  amount: number;
  recipient: string;
  description: string | null;
  status: string;
  currentCategory: string | null;
  suggestedParent: string | null;
  suggestedCategory: string | null;
  suggestedCategoryExists: boolean;
  costCenter: string;
  costCenterApplied: boolean;
  suggestedProperty: string | null;
  propertyWillBeCreated: boolean;
  confidence: Confidence;
  reason: string;
};

export type OrganizerPlan = {
  profile: { id: string; name: string };
  totalReceipts: number;
  autoItems: OrganizerPlanItem[];
  reviewItems: OrganizerPlanItem[];
  unmatched: number;
  costCenterExists: boolean;
};

function evidenceReceipt(row: any): OrganizerReceipt & { status: string } {
  const ocr = row.ocr_data && typeof row.ocr_data === "object" ? JSON.stringify(row.ocr_data) : null;
  return {
    id: row.id,
    recipient_name: row.recipient_name,
    recipient_tax_id: row.recipient_tax_id,
    description: row.description,
    notes: row.notes,
    file_name: row.file_name,
    bank_name: row.bank_name,
    amount: row.amount,
    payment_date: row.payment_date,
    category_id: row.category_id,
    property_id: row.property_id,
    cost_center_id: row.cost_center_id,
    ocr_text: ocr,
    status: row.status,
  };
}

export async function loadOrganizerContext(
  supabase: Client,
  userId: string,
  profileId: string,
): Promise<OrganizerContext> {
  const { data: profile, error: profileError } = await supabase
    .from("financial_profiles")
    .select("id, name, type")
    .eq("id", profileId)
    .eq("user_id", userId)
    .maybeSingle();
  if (profileError) throw new Error(profileError.message);
  if (!profile) throw new Error("Perfil não encontrado");
  if (profile.type !== "holding") throw new Error("Esta organização só pode ser executada em um perfil Holding");

  const [receiptsRes, categoriesRes, costCentersRes, propertiesRes] = await Promise.all([
    supabase
      .from("receipts")
      .select(
        "id, recipient_name, recipient_tax_id, description, notes, file_name, bank_name, amount, payment_date, category_id, property_id, cost_center_id, status, ocr_data",
      )
      .eq("user_id", userId)
      .eq("profile_id", profileId)
      .order("payment_date", { ascending: false })
      .limit(5000),
    supabase.from("categories").select("id, name, parent_id").eq("user_id", userId),
    supabase.from("cost_centers").select("id, name").eq("user_id", userId).eq("profile_id", profileId),
    supabase
      .from("properties")
      .select("id, name, address, registration")
      .eq("user_id", userId)
      .or(`profile_id.eq.${profileId},profile_id.is.null`),
  ]);
  for (const res of [receiptsRes, categoriesRes, costCentersRes, propertiesRes]) {
    if (res.error) throw new Error(res.error.message);
  }

  const receipts = (receiptsRes.data ?? []).map(evidenceReceipt);
  const suggestions = new Map<string, AdvocaciaSuggestion>();
  for (const receipt of receipts) suggestions.set(receipt.id, classifyAdvocaciaReceipt(receipt));

  return {
    profile,
    receipts,
    suggestions,
    categories: categoriesRes.data ?? [],
    costCenters: costCentersRes.data ?? [],
    properties: propertiesRes.data ?? [],
  };
}

function categoryByName(ctx: OrganizerContext, name: string, parentId: string | null | undefined) {
  const target = normalizeText(name);
  return (
    ctx.categories.find(
      (c) => normalizeText(c.name) === target && (parentId === undefined || c.parent_id === parentId),
    ) ?? null
  );
}

export function buildOrganizerPlan(ctx: OrganizerContext): OrganizerPlan {
  const costCenter = ctx.costCenters.find((cc) => normalizeText(cc.name).includes("advocacia")) ?? null;
  const autoItems: OrganizerPlanItem[] = [];
  const reviewItems: OrganizerPlanItem[] = [];
  let unmatched = 0;

  for (const receipt of ctx.receipts) {
    const suggestion = ctx.suggestions.get(receipt.id)!;
    if (!suggestion.matched) {
      unmatched += 1;
      continue;
    }
    const current = receipt.category_id ? ctx.categories.find((c) => c.id === receipt.category_id) : null;
    const suggestedCategory = suggestion.categoryChild
      ? categoryByName(ctx, suggestion.categoryChild, undefined)
      : null;
    const existingProperty = suggestion.propertyHint
      ? findExistingProperty(suggestion.propertyHint, ctx.properties)
      : null;

    const item: OrganizerPlanItem = {
      receiptId: receipt.id,
      paymentDate: receipt.payment_date ?? null,
      amount: Number(receipt.amount ?? 0),
      recipient: receipt.recipient_name ?? "—",
      description: receipt.description ?? null,
      status: receipt.status,
      currentCategory: current?.name ?? null,
      suggestedParent: suggestion.categoryParent,
      suggestedCategory: suggestion.categoryChild,
      suggestedCategoryExists: Boolean(suggestedCategory),
      costCenter: costCenter?.name ?? ADVOCACIA_COST_CENTER,
      costCenterApplied: Boolean(receipt.cost_center_id && receipt.cost_center_id === costCenter?.id),
      suggestedProperty:
        existingProperty?.name ??
        (suggestion.propertyHint && suggestion.confidence === "high"
          ? propertyNameFromHint(suggestion.propertyHint)
          : null),
      propertyWillBeCreated: Boolean(!existingProperty && suggestion.propertyHint && suggestion.confidence === "high"),
      confidence: suggestion.confidence,
      reason: suggestion.reason,
    };

    if (suggestion.confidence === "high") autoItems.push(item);
    else reviewItems.push(item);
  }

  return {
    profile: { id: ctx.profile.id, name: ctx.profile.name },
    totalReceipts: ctx.receipts.length,
    autoItems,
    reviewItems,
    unmatched,
    costCenterExists: Boolean(costCenter),
  };
}

export type EnsuredTaxonomy = {
  costCenterId: string;
  costCenterCreated: boolean;
  categoryIdByChild: Map<string, string>;
  created: string[];
};

/** Cria/reutiliza centro de custo, categorias e a regra para lançamentos futuros. */
export async function ensureAdvocaciaTaxonomy(
  supabase: Client,
  userId: string,
  profileId: string,
  ctx: OrganizerContext,
): Promise<EnsuredTaxonomy> {
  const { data: ccResult, error: ccError } = await supabase.rpc("ensure_cost_center_rpc", {
    p_profile_id: profileId,
    p_name: ADVOCACIA_COST_CENTER,
  });
  if (ccError) throw new Error(ccError.message);
  const costCenterId = ccResult?.[0]?.cost_center_id as string;
  const costCenterCreated = Boolean(ccResult?.[0]?.created);

  const created: string[] = [];
  const categoryIdByChild = new Map<string, string>();

  // Somente os grupos realmente usados pelas sugestões atuais.
  const neededPairs = new Set<string>();
  for (const suggestion of ctx.suggestions.values()) {
    if (suggestion.matched && suggestion.categoryParent && suggestion.categoryChild) {
      neededPairs.add(`${suggestion.categoryParent}||${suggestion.categoryChild}`);
    }
  }

  for (const pair of neededPairs) {
    const [parentName, childName] = pair.split("||");
    let parent = categoryByName(ctx, parentName, undefined);
    if (!parent) {
      const { data: inserted, error } = await supabase
        .from("categories")
        .insert({ user_id: userId, name: parentName, archived: false })
        .select("id, name, parent_id")
        .single();
      if (error) throw new Error(error.message);
      parent = inserted;
      ctx.categories.push(inserted);
      created.push(parentName);
    }

    let child = ctx.categories.find(
      (c) => normalizeText(c.name) === normalizeText(childName) && c.parent_id === parent!.id,
    );
    if (!child) {
      const orphan = ctx.categories.find(
        (c) => normalizeText(c.name) === normalizeText(childName) && c.parent_id === null,
      );
      if (orphan) {
        child = orphan;
      } else {
        const { data: inserted, error } = await supabase
          .from("categories")
          .insert({ user_id: userId, name: childName, parent_id: parent!.id, archived: false })
          .select("id, name, parent_id")
          .single();
        if (error) throw new Error(error.message);
        child = inserted;
        ctx.categories.push(inserted);
        created.push(`${parentName} › ${childName}`);
      }
    }
    categoryIdByChild.set(childName, child!.id);
  }

  // Regra para lançamentos futuros importados diretamente no perfil Holding.
  const { data: existingRule } = await supabase
    .from("classification_rules")
    .select("id")
    .eq("user_id", userId)
    .eq("profile_id", profileId)
    .eq("name", ADVOCACIA_RULE_NAME)
    .maybeSingle();
  const rulePayload = {
    user_id: userId,
    profile_id: profileId,
    cost_center_id: costCenterId,
    name: ADVOCACIA_RULE_NAME,
    terms: ADVOCACIA_TERMS.map((t) => t.term),
    active: true,
  };
  if (existingRule) {
    await supabase.from("classification_rules").update(rulePayload).eq("id", existingRule.id);
  } else {
    await supabase.from("classification_rules").insert(rulePayload);
  }

  return { costCenterId, costCenterCreated, categoryIdByChild, created };
}

export async function resolveOrganizerItems(
  supabase: Client,
  userId: string,
  profileId: string,
  ctx: OrganizerContext,
  taxonomy: EnsuredTaxonomy,
  receiptIds: string[],
  override: boolean,
) {
  const items: Record<string, unknown>[] = [];
  let propertiesCreated = 0;
  let propertiesReused = 0;

  for (const receiptId of receiptIds) {
    const suggestion = ctx.suggestions.get(receiptId);
    if (!suggestion || !suggestion.matched) continue;

    let propertyId: string | null = null;
    if (suggestion.propertyHint) {
      const existing = findExistingProperty(suggestion.propertyHint, ctx.properties);
      if (existing) {
        propertyId = existing.id;
        propertiesReused += 1;
      } else if (suggestion.confidence === "high") {
        const name = propertyNameFromHint(suggestion.propertyHint);
        const { data: inserted, error } = await supabase
          .from("properties")
          .insert({
            user_id: userId,
            profile_id: profileId,
            cost_center_id: taxonomy.costCenterId,
            name,
            address: name,
            type: "outro",
            status: "proprio",
            notes: "Criado automaticamente pela organização da Advocacia Liliane Pereira",
          })
          .select("id, name, address, registration")
          .single();
        if (error) throw new Error(error.message);
        ctx.properties.push(inserted);
        propertyId = inserted.id;
        propertiesCreated += 1;
      }
    }

    const categoryId = suggestion.categoryChild ? taxonomy.categoryIdByChild.get(suggestion.categoryChild) ?? null : null;

    items.push({
      receipt_id: receiptId,
      category_id: categoryId,
      cost_center_id: taxonomy.costCenterId,
      property_id: propertyId,
      confidence: suggestion.confidence,
      reason: suggestion.reason,
      rule: ADVOCACIA_RULE_NAME,
      natureza: suggestion.natureza ?? null,
      tipo_gasto: suggestion.tipo_gasto ?? null,
      override,
    });
  }

  return { items, propertiesCreated, propertiesReused };
}

export const TAXONOMY_GROUPS = ADVOCACIA_TAXONOMY;