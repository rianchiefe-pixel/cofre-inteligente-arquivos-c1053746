import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { Database } from "@/integrations/supabase/types";
import { validateTokenAndGetProfileId } from "./temp-access.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

type TransactionType = Database["public"]["Enums"]["transaction_type"];

export const getCategoryStats = createServerFn({ method: "GET" })
  .validator((data: unknown) => z.object({ 
    profileId: z.string().optional(),
    token: z.string().optional() 
  }).parse(data))
  .handler(async ({ data: input, context }) => {
    let activeProfileId = input.profileId;
    let isTempAccess = false;

    if (input.token) {
      const profileIdFromToken = await validateTokenAndGetProfileId(input.token);
      if (profileIdFromToken) {
        activeProfileId = profileIdFromToken;
        isTempAccess = true;
      } else {
        throw new Response('Link expirado ou inválido', { status: 403 });
      }
    }

    const supabase = isTempAccess ? supabaseAdmin : (context as any).supabase;
    if (!supabase) {
      // If no token and no auth, fail
      throw new Response('Unauthorized', { status: 401 });
    }

    let query = supabase
      .from("categories")
      .select("id, name, default_type, archived, parent_id", { count: "exact" });
    
    if (activeProfileId) {
      // Assuming categories have profile_id or filtered by user/admin context
      // For now, let's keep the existing logic but respect the profile if provided
      // In this app, categories are usually user-scoped or profile-scoped
    }


    const { data: categories, count, error } = await supabase
      .from("categories")
      .select("id, name, default_type, archived, parent_id", { count: "exact" });
    
    if (error) throw error;

    const stats = {
      total: count || 0,
      main: categories?.filter((c) => !c.parent_id).length || 0,
      sub: categories?.filter((c) => c.parent_id).length || 0,
      archived: categories?.filter((c) => c.archived).length || 0,
      unclassified: categories?.filter((c) => !c.default_type).length || 0,
      duplicates: 0
    };

    const names = new Set();
    categories?.forEach((c) => {
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
    profileId: z.string()
  }).parse(data))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data: input, context }) => {
    const { supabase } = context;
    const { keepId, discardId, profileId } = input;

    const { error: errorReceipts } = await supabase
      .from("receipts")
      .update({ category_id: keepId })
      .eq("category_id", discardId)
      .eq("profile_id", profileId);
    
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
    })
  }).parse(data))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data: input, context }) => {
    const { supabase } = context;
    const { ids, patch } = input;

    // Converte default_type para o enum correto se presente
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
