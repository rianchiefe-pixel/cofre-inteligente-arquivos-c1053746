import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { validateTokenAndGetProfileId } from "../temp-access.server";
// import { generateText } from "ai"; // Lovable AI Gateway usually available via ai-gateway namespace

export type DeduplicationGroup = {
  id: string;
  suggestedName: string;
  confidence: "very_high" | "high" | "medium" | "low";
  reason: string;
  categories: {
    id: string;
    name: string;
    count: number;
  }[];
};

export async function analyzeCategoriesWithAI(profileId: string, token?: string) {
  // 1. Validate Access
  let targetProfileId = profileId;
  if (token) {
    const verifiedId = await validateTokenAndGetProfileId(token);
    if (!verifiedId || verifiedId !== profileId) {
      throw new Error("Acesso negado");
    }
    targetProfileId = verifiedId;
  }

  // 2. Fetch Categories
  // Note: Standard project structure uses standard filters.
  const { data: categories } = await supabaseAdmin
    .from("categories")
    .select("id, name, default_type, archived, parent_id");
    // .eq("profile_id", targetProfileId) -- If table had profile_id, categories are global in this schema
  
  // Nota: Como a tabela 'categories' parece não ter 'profile_id' diretamente, 
  // mas 'receipts' tem, buscamos a contagem de lançamentos por categoria 
  // para o perfil alvo, o que ajuda a decidir qual categoria manter na mesclagem.
  
  const { data: receipts } = await supabaseAdmin
    .from("receipts")
    .select("category_id")
    .eq("profile_id", targetProfileId);

  const categoryCounts = new Map<string, number>();
  receipts?.forEach(r => {
    if (r.category_id) {
      categoryCounts.set(r.category_id, (categoryCounts.get(r.category_id) || 0) + 1);
    }
  });

  if (!categories || categories.length === 0) return { groups: [] };

  // 3. Normalized Grouping (Heuristic)
  const normalizedMap = new Map<string, any[]>();
  
  const normalize = (name: string) => {
    return name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\w\s]/gi, "")
      .replace(/\s+/g, " ")
      .trim();
  };

  categories.forEach(cat => {
    const norm = normalize(cat.name);
    if (!normalizedMap.has(norm)) normalizedMap.set(norm, []);
    normalizedMap.get(norm)!.push(cat);
  });

  // 4. Build Suggestions Groups
  const groups: DeduplicationGroup[] = [];
  
  for (const [norm, members] of normalizedMap.entries()) {
    if (members.length > 1) {
      // Pick the best name (usually the one with proper casing or most usage)
      const bestName = members.reduce((a, b) => {
        const aCount = categoryCounts.get(a.id) || 0;
        const bCount = categoryCounts.get(b.id) || 0;
        if (aCount !== bCount) return aCount > bCount ? a : b;
        
        const aUpper = (a.name.match(/[A-Z]/g) || []).length;
        const bUpper = (b.name.match(/[A-Z]/g) || []).length;
        return aUpper >= bUpper ? a : b;
      }).name;

      groups.push({
        id: `group-${norm}`,
        suggestedName: bestName,
        confidence: "very_high",
        reason: "Nomes idênticos após normalização (espaços, acentos ou maiúsculas)",
        categories: members.map(m => ({
          id: m.id,
          name: m.name,
          count: categoryCounts.get(m.id) || 0
        }))
      });
    }
  }

  // TODO: Implement semantic AI grouping (e.g. "Energia" vs "Luz") using AI Gateway
  
  return { groups };
}
