import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { Database } from "@/integrations/supabase/types";
import { validateTokenAndGetProfileId } from "./temp-access.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

type TransactionType = Database["public"]["Enums"]["transaction_type"];

async function getSupabaseClient(input: { token?: string }, context: any) {
  if (input.token) {
    const profileIdFromToken = await validateTokenAndGetProfileId(input.token);
    if (profileIdFromToken) {
      return { supabase: supabaseAdmin, profileId: profileIdFromToken, isTemp: true };
    }
    throw new Response('Link expirado ou inválido', { status: 403 });
  }

  const { supabase } = context;
  if (!supabase) throw new Response('Unauthorized', { status: 401 });
  return { supabase, profileId: null, isTemp: false };
}

export const getCategoryStats = createServerFn({ method: "GET" })
  .validator((data: unknown) => z.object({ 
    profileId: z.string().optional(),
    token: z.string().optional() 
  }).parse(data))
  .handler(async ({ data: input, context }) => {
    const { supabase } = await getSupabaseClient(input, context);

    // Nota: categories table in types does not have profile_id directly, 
    // but receipts do. In a multi-tenant system categories are usually 
    // shared or user-specific. We use the connection's context.
    const { data: categories, count, error } = await supabase
      .from("categories")
      .select("id, name, default_type, archived, parent_id", { count: "exact" });
    
    if (error) throw error;

    const stats = {
      total: count || 0,
      main: categories?.filter((c: any) => !c.parent_id).length || 0,
      sub: categories?.filter((c: any) => c.parent_id).length || 0,
      archived: categories?.filter((c: any) => c.archived).length || 0,
      unclassified: categories?.filter((c: any) => !c.default_type).length || 0,
      duplicates: 0
    };

    const names = new Set();
    categories?.forEach((c: any) => {
      const n = c.name.toLowerCase().trim();
      if (names.has(n)) stats.duplicates++;
      names.add(n);
    });

    return { categories: categories || [], stats };
  });

export const mergeCategories = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({
    keepId: z.string(),
    discardId: z.string(),
    profileId: z.string(),
    token: z.string().optional()
  }).parse(data))
  .handler(async ({ data: input, context }) => {
    const { supabase, profileId: tokenProfileId } = await getSupabaseClient(input, context);
    const { keepId, discardId, profileId } = input;

    // Se for acesso via token, garante que o profileId bate
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
  .validator((data: unknown) => z.object({
    ids: z.array(z.string()),
    patch: z.object({
      default_type: z.string().optional(),
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
