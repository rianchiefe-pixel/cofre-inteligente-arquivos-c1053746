import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const getCategoryStats = createServerFn({ method: "GET" })
  .validator((data: unknown) => z.object({ profileId: z.string().optional() }).parse(data))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data: input, context }) => {
    const { supabase } = context;
    const { profileId } = input;

    // Nota: categories no schema atual não tem profile_id, mas a solicitação foca na Holding.
    // Usaremos user_id do perfil da Holding para filtrar, ou traremos todas do usuário.
    let query = supabase.from("categories").select("id, name, default_type, archived, parent_id", { count: "exact" });
    
    const { data: categories, count, error } = await query;
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
    profileId: z.string()
  }).parse(data))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data: input, context }) => {
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

    const { error } = await supabase
      .from("categories")
      .update(patch)
      .in("id", ids);

    if (error) throw error;
    return { success: true };
  });
