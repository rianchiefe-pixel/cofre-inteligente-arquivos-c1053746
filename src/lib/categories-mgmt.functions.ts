import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const getCategoryStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .input(z.object({ profileId: z.string().optional() }))
  .handler(async ({ input, context }) => {
    const { supabase } = context;
    const { profileId } = input;

    let query = supabase.from("categories").select("id, name, default_type, archived, parent_id", { count: "exact" });
    if (profileId) query = query.eq("profile_id", profileId);

    const { data: categories, count, error } = await query;
    if (error) throw error;

    // Em um sistema real, faríamos joins ou múltiplas queries para contar lançamentos.
    // Para o MVP de organização, focaremos nos metadados da categoria.
    
    const stats = {
      total: count || 0,
      main: categories?.filter(c => !c.parent_id).length || 0,
      sub: categories?.filter(c => c.parent_id).length || 0,
      archived: categories?.filter(c => c.archived).length || 0,
      unclassified: categories?.filter(c => !c.default_type).length || 0,
      // Simulando detecção de duplicidade básica por nome (case insensitive)
      duplicates: 0
    };

    const names = new Set();
    categories?.forEach(c => {
      const n = c.name.toLowerCase().trim();
      if (names.has(n)) stats.duplicates++;
      names.add(n);
    });

    return { categories, stats };
  });

export const mergeCategories = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .input(z.object({
    keepId: z.string(),
    discardId: z.string(),
    profileId: z.string()
  }))
  .handler(async ({ input, context }) => {
    const { supabase } = context;
    const { keepId, discardId, profileId } = input;

    // 1. Transferir lançamentos
    const { error: errorReceipts } = await supabase
      .from("receipts")
      .update({ category_id: keepId })
      .eq("category_id", discardId)
      .eq("profile_id", profileId);
    
    if (errorReceipts) throw errorReceipts;

    // 2. Arquivar a categoria descartada
    const { error: errorArchive } = await supabase
      .from("categories")
      .update({ archived: true })
      .eq("id", discardId);

    if (errorArchive) throw errorArchive;

    return { success: true };
  });

export const bulkUpdateCategories = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .input(z.object({
    ids: z.array(z.string()),
    patch: z.object({
      default_type: z.string().optional(),
      parent_id: z.string().nullable().optional(),
      archived: z.boolean().optional()
    })
  }))
  .handler(async ({ input, context }) => {
    const { supabase } = context;
    const { ids, patch } = input;

    const { error } = await supabase
      .from("categories")
      .update(patch)
      .in("id", ids);

    if (error) throw error;
    return { success: true };
  });
