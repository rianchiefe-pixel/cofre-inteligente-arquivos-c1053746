import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/**
 * Normaliza um nome de categoria para detecção de duplicidades.
 */
export function normalizeCategoryName(name: string): string {
  if (!name) return "";
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove acentos
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ") // Espaços múltiplos para um só
    .replace(/\s*([/\-()])\s*/g, "$1") // Normaliza espaços em volta de separadores
    .replace(/[.,;]/g, ""); // Remove pontuação irrelevante
}

export const auditCategories = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    // 1. Carrega todas as categorias do usuário
    const { data: categories, error: catError } = await supabase
      .from("categories")
      .select("id, name, parent_id, default_type, archived, created_at")
      .order("name");

    if (catError) throw new Error(`Erro ao auditar categorias: ${catError.message}`);
    if (!categories || categories.length === 0) return { total: 0, duplicates: [] };

    // 2. Carrega estatísticas de uso (lançamentos)
    const { data: receipts, error: recError } = await supabase
      .from("receipts")
      .select("id, category_id, amount");

    if (recError) throw new Error(`Erro ao carregar estatísticas de uso: ${recError.message}`);

    const stats = (receipts || []).reduce((acc: any, r: any) => {
      if (r.category_id) {
        if (!acc[r.category_id]) acc[r.category_id] = { count: 0, total: 0 };
        acc[r.category_id].count++;
        acc[r.category_id].total += Math.round(Math.abs(Number(r.amount ?? 0)) * 100);
      }
      return acc;
    }, {});

    // 3. Agrupa por nome normalizado
    const groups: Record<string, any[]> = {};
    for (const cat of categories) {
      const norm = normalizeCategoryName(cat.name);
      if (!groups[norm]) groups[norm] = [];
      groups[norm].push({
        ...cat,
        receipt_count: stats[cat.id]?.count || 0,
        total_amount: stats[cat.id]?.total || 0,
      });
    }

    // 4. Identifica duplicidades
    const duplicateGroups = Object.entries(groups)
      .filter(([_, items]) => items.length > 1)
      .map(([norm, items]) => {
        // Ordena para escolher o canônico (mais lançamentos > mais antigo)
        const sorted = [...items].sort((a, b) => {
          if (b.receipt_count !== a.receipt_count) return b.receipt_count - a.receipt_count;
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        });

        return {
          normalized: norm,
          canonical: sorted[0],
          others: sorted.slice(1),
        };
      });

    return {
      total: categories.length,
      duplicates: duplicateGroups,
    };
  });

export const mergeCategories = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    canonicalId: z.string().uuid(),
    toMergeIds: z.array(z.string().uuid()),
  }))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { canonicalId, toMergeIds } = data;

    // 1. Verificar se a canônica existe
    const { data: canonical, error: canError } = await supabase
      .from("categories")
      .select("id, name")
      .eq("id", canonicalId)
      .single();
    if (canError || !canonical) throw new Error("Categoria canônica não encontrada.");

    // 2. Migrar lançamentos (receipts)
    const { error: updRecError } = await supabase
      .from("receipts")
      .update({ category_id: canonicalId })
      .in("category_id", toMergeIds);
    if (updRecError) throw new Error(`Erro ao migrar lançamentos: ${updRecError.message}`);

    // 3. Migrar sugestões de IA (ai_suggested_category_id em receipts se existir)
    // Nota: dependendo da estrutura, pode haver outras referências
    const { error: updAiError } = await supabase
      .from("receipts")
      .update({ ai_suggested_category_id: canonicalId })
      .in("ai_suggested_category_id", toMergeIds);
    // Não travamos se falhar, pois o campo pode não existir em todas as tabelas
    
    // 4. Migrar destinatários (recipients)
    const { error: updRecipientError } = await supabase
      .from("recipients")
      .update({ default_category_id: canonicalId })
      .in("default_category_id", toMergeIds);
    if (updRecipientError) console.warn("Erro ao atualizar destinatários:", updRecipientError.message);

    // 5. Arquivar ou excluir categorias duplicadas
    // Seguindo a regra 15: arquivar primeiro para manter rastreabilidade
    const { error: delError } = await supabase
      .from("categories")
      .update({ archived: true })
      .in("id", toMergeIds);
    if (delError) throw new Error(`Erro ao arquivar categorias duplicadas: ${delError.message}`);

    // Log de auditoria (simplificado)
    await supabase.from("audit_logs").insert({
      user_id: userId,
      action: "MERGE_CATEGORIES",
      entity: "categories",
      entity_id: canonicalId,
      new_value: { merged_ids: toMergeIds },
      note: `Unificadas ${toMergeIds.length} categorias em "${canonical.name}"`,
    });

    return { ok: true };
  });
