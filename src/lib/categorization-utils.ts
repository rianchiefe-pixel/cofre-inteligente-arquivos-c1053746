import { supabase } from "@/integrations/supabase/client";

/**
 * Shared utility to determine if a receipt is considered "uncategorized".
 * Logic matches the report's canonical classification.
 */
export function isUncategorizedReceipt(receipt: {
  category_id: string | null;
  categories?: { name: string } | null;
}) {
  const catName = receipt.categories?.name;
  const isTechUncategorized = 
    catName === 'Não identificado' || 
    catName === 'não identificado' || 
    catName === 'Não informado' || 
    catName === 'não informado' || 
    catName === 'Sem categoria' || 
    catName === 'Sem categoria definida';
    
  return !receipt.category_id || isTechUncategorized;
}
