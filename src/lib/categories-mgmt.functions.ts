import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { Database } from "@/integrations/supabase/types";
import { validateTokenAndGetProfileId } from "./temp-access.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

type TransactionType = Database["public"]["Enums"]["transaction_type"];
type ExpenseBehavior = 'fixed' | 'variable';

async function getSupabaseClient(input: { token?: string }, context: any) {
  const { supabase, userId } = context;

  if (input.token) {
    const profileIdFromToken = await validateTokenAndGetProfileId(input.token);
    if (profileIdFromToken) {
      // For temporary access, we need to know WHICH user owns this profile to find categories
      const { data: profile } = await supabaseAdmin
        .from('financial_profiles')
        .select('user_id')
        .eq('id', profileIdFromToken)
        .single();

      return { 
        supabase: supabaseAdmin, 
        profileId: profileIdFromToken, 
        isTemp: true, 
        userId: profile?.user_id 
      };
    }
    throw new Response('Link expirado ou inválido', { status: 403 });
  }

  if (!supabase || !userId) throw new Response('Unauthorized', { status: 401 });
  return { supabase, profileId: null, isTemp: false, userId };
}

function normalizeName(name: string) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export const getCategoryStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ 
    profileId: z.string().optional(),
    token: z.string().optional() 
  }).parse(data))
  .handler(async ({ data: input, context }) => {
    const { supabase, profileId: tokenProfileId, userId } = await getSupabaseClient(input, context);
    const targetProfileId = tokenProfileId || input.profileId;

    if (!targetProfileId) {
      console.warn("[getCategoryStats] No targetProfileId provided");
      return { categories: [], stats: { total: 0, main: 0, sub: 0, archived: 0, unclassified: 0, duplicates: 0 } };
    }

    if (!userId) {
      console.error("[getCategoryStats] No userId found in context/token");
      throw new Error("Usuário não identificado.");
    }

    console.log(`[getCategoryStats] Fetching categories for userId: ${userId}`);
    const { data: dbCategories, error: catError } = await supabase
      .from("categories")
      .select("id, name, default_type, archived, parent_id, created_at")
      .eq("user_id", userId);
    
    if (catError) {
      console.error("[getCategoryStats] Error fetching categories:", catError);
      throw catError;
    }
    console.log(`[getCategoryStats] Found ${dbCategories?.length || 0} categories`);

    const { data: receiptsData, error: recError } = await supabase
      .from("receipts")
      .select("category_id, amount")
      .eq("profile_id", targetProfileId)
      .is("duplicate_of", null);
    
    if (recError) throw recError;

    const usageMap = new Map<string, { count: number, total: number }>();
    receiptsData?.forEach((r: any) => {
      if (r.category_id) {
        const stats = usageMap.get(r.category_id) || { count: 0, total: 0 };
        stats.count++;
        stats.total += Number(r.amount || 0);
        usageMap.set(r.category_id, stats);
      }
    });

    const categories = (dbCategories || []).map((c: any) => ({
      ...c,
      count: usageMap.get(c.id)?.count || 0,
      total_amount: usageMap.get(c.id)?.total || 0
    }));

    // Local normalization for duplicate counting
    const normalize = (name: string) => name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/\s+/g, " ");
    const nameGroups = new Map<string, string[]>();
    categories.forEach((c: any) => {
      if (c.archived) return;
      const n = normalize(c.name);
      if (!nameGroups.has(n)) nameGroups.set(n, []);
      nameGroups.get(n)!.push(c.id);
    });

    let duplicatesCount = 0;
    nameGroups.forEach(ids => {
      if (ids.length > 1) duplicatesCount += (ids.length - 1);
    });

    const stats = {
      total: categories.length,
      main: categories.filter((c: any) => !c.parent_id).length,
      sub: categories.filter((c: any) => c.parent_id).length,
      archived: categories.filter((c: any) => c.archived).length,
      unclassified: categories.filter((c: any) => !c.default_type).length,
      duplicates: duplicatesCount
    };

    return { categories, stats };
  });

export const mergeCategories = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({
    keepId: z.string(),
    discardId: z.string(),
    profileId: z.string(),
    token: z.string().optional()
  }).parse(data))
  .handler(async ({ data: input, context }) => {
    const { supabase, profileId: tokenProfileId } = await getSupabaseClient(input, context);
    const { keepId, discardId, profileId } = input;

    const targetProfileId = tokenProfileId || profileId;

    const { error: errorReceipts } = await supabase
      .from("receipts")
      .update({ category_id: keepId })
      .eq("category_id", discardId)
      .eq("profile_id", targetProfileId);
    
    if (errorReceipts) throw errorReceipts;

    const { error: errorArchive } = await supabase
      .from("categories")
      .update({ archived: true })
      .eq("id", discardId);

    if (errorArchive) throw errorArchive;

    return { success: true };
  });

export const bulkUpdateCategories = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({
    ids: z.array(z.string()),
    patch: z.object({
      default_type: z.string().optional(),
      expense_behavior: z.enum(['fixed', 'variable']).nullable().optional(),
      parent_id: z.string().nullable().optional(),
      archived: z.boolean().optional()
    }),
    token: z.string().optional(),
    profileId: z.string().optional()
  }).parse(data))
  .handler(async ({ data: input, context }) => {
    const { supabase } = await getSupabaseClient(input, context);
    const { ids, patch } = input;

    const updatePayload: any = { ...patch };
    if (patch.default_type) {
      updatePayload.default_type = patch.default_type as TransactionType;
    }

    const { error } = await supabase
      .from("categories")
      .update(updatePayload)
      .in("id", ids);

    if (error) throw error;
    return { success: true };
  });

export const syncMissingCategories = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({
    profileId: z.string()
  }).parse(data))
  .handler(async ({ data: input, context }) => {
    const { supabase, userId } = await getSupabaseClient({ }, context);
    const { profileId } = input;

    const { data: existing } = await supabase
      .from("categories")
      .select("id, name")
      .eq("user_id", userId);
    
    const existingNames = new Set(existing?.map((c: any) => normalizeName(c.name)));

    return { ok: true, profileId, existingNamesCount: existingNames.size };
  });
