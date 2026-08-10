import { supabase } from "@/integrations/supabase/client";

/**
 * Shared utility to determine if a receipt is considered "uncategorized".
 * Logic matches the report's canonical classification.
 */
export function isUncategorizedReceipt(receipt: {
  category_id: string | null;
  categories?: { name: string } | null;
}) {
  const catName = receipt.categories?.name || '';
  const name = catName.toLowerCase();
  
  const isTechUncategorized = 
    name.includes('não identificado') || 
    name.includes('não informado') || 
    name.includes('sem categoria') || 
    name.includes('não classificado');
    
  return !receipt.category_id || isTechUncategorized;
}
