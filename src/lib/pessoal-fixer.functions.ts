import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { PESSOAL_TAXONOMY } from "./pessoal-taxonomy";

export const fixPessoalCategories = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    // 1. Identificar o perfil "Pessoal"
    const { data: profile, error: profileError } = await supabase
      .from("financial_profiles")
      .select("id")
      .eq("user_id", userId)
      .eq("name", "Pessoal")
      .maybeSingle();

    if (profileError) throw new Error(profileError.message);
    if (!profile) throw new Error("Perfil 'Pessoal' não encontrado para este usuário.");

    const profileId = profile.id;

    // 2. Mapeamento de migração (Origem -> Novo)
    // Isso ajuda a mover lançamentos de categorias antigas para as novas antes de arquivá-las.
    const migrationMap: Record<string, { parent: string; child: string }> = {
      "Energia": { parent: "Habitação", child: "Energia Elétrica" },
      "Água": { parent: "Habitação", child: "Água e Esgoto" },
      "Internet": { parent: "Habitação", child: "Internet e TV" },
      "IPTU": { parent: "Impostos e Taxas", child: "Imposto de Renda" }, // Ou adicionar IPTU em Habitação se preferir
      "Alimentação": { parent: "Alimentação", child: "Restaurantes e Bares" },
      "Mercado": { parent: "Alimentação", child: "Supermercado" },
      "Transporte": { parent: "Transporte", child: "Uber e Apps" },
      "Assinaturas": { parent: "Lazer e Estilo de Vida", child: "Assinaturas Diversas" },
      "Saúde": { parent: "Saúde e Bem-estar", child: "Consultas e Exames" },
      "Educação": { parent: "Educação", child: "Cursos e Treinamentos" },
      "Outros": { parent: "Outros", child: "Despesas Diversas" },
    };

    // 3. Garantir a nova taxonomia no banco
    const categoryMap = new Map<string, string>(); // nome -> id

    for (const group of PESSOAL_TAXONOMY) {
      // Garantir Pai
      let { data: parent, error: parentError } = await supabase
        .from("categories")
        .select("id")
        .eq("user_id", userId)
        .eq("name", group.parent)
        .is("parent_id", null) // Correctly check for null using .is()
        .maybeSingle();

      if (!parent) {
        const { data: inserted, error } = await supabase
          .from("categories")
          .insert({ user_id: userId, name: group.parent, archived: false })
          .select("id")
          .single();
        if (error) throw new Error(`Falha ao criar pai ${group.parent}: ${error.message}`);
        parent = inserted;
      }
      
      categoryMap.set(group.parent, parent!.id);

      // Garantir Filhos
      for (const child of group.children) {
        let { data: childCat, error: childError } = await supabase
          .from("categories")
          .select("id")
          .eq("user_id", userId)
          .eq("name", child.name)
          .eq("parent_id", parent!.id)
          .maybeSingle();

        if (!childCat) {
          const { data: inserted, error } = await supabase
            .from("categories")
            .insert({ 
              user_id: userId, 
              name: child.name, 
              parent_id: parent!.id, 
              default_type: child.type,
              archived: false 
            })
            .select("id")
            .single();
          if (error) throw new Error(`Falha ao criar filho ${child.name}: ${error.message}`);
          childCat = inserted;
        }
        categoryMap.set(`${group.parent} > ${child.name}`, childCat!.id);
      }
    }

    // 4. Mover lançamentos existentes
    // Buscamos categorias ativas do usuário que não estão na nova taxonomia (ou que coincidem com o mapa)
    const { data: oldCats } = await supabase
      .from("categories")
      .select("id, name")
      .eq("user_id", userId)
      .eq("archived", false);

    let movedCount = 0;
    if (oldCats) {
      for (const old of oldCats) {
        const target = migrationMap[old.name];
        if (target) {
          const targetId = categoryMap.get(`${target.parent} > ${target.child}`);
          if (targetId && targetId !== old.id) {
            const { error } = await supabase
              .from("receipts")
              .update({ category_id: targetId })
              .eq("profile_id", profileId)
              .eq("category_id", old.id);
            if (!error) movedCount++;
          }
        }
      }
    }

    // 5. Arquivar categorias antigas que não são pais na nova taxonomia e nem filhos
    const newCatIds = new Set(Array.from(categoryMap.values()));
    const { error: archiveError } = await supabase
      .from("categories")
      .update({ archived: true })
      .eq("user_id", userId)
      .not("id", "in", `(${Array.from(newCatIds).join(',')})`);

    return { 
      success: true, 
      profileId, 
      categoriesCount: newCatIds.size,
      movedCount
    };
  });
