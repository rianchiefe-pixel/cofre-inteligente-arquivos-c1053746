import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function diagnose() {
  const profileId = 'c44c244d-b05f-47dc-bc58-7056351e7703'; // Pessoal
  const userId = '53be3bb2-2bbc-4f66-abe7-34fdbf44064e';

  console.log("--- 1. 10 Lançamentos Reais (Pessoal) ---");
  const { data: receipts } = await supabase
    .from('receipts')
    .select('id, profile_id, category_id')
    .eq('profile_id', profileId)
    .not('category_id', 'is', null)
    .limit(10);
  
  console.table(receipts);

  if (receipts && receipts.length > 0) {
    const catIds = receipts.map(r => r.category_id);
    console.log("\n--- 2. Consulta Direta em 'categories' ---");
    const { data: categories } = await supabase
      .from('categories')
      .select('id, name, user_id, archived')
      .in('id', catIds);
    
    console.table(categories);
  }

  console.log("\n--- 3. Verificação de RLS (Policies) ---");
  const { data: policies } = await supabase.rpc('get_policies_for_table', { table_name: 'categories' });
  // Se o RPC não existir, tentamos via query direta na pg_policies
  const { data: pgPolicies } = await supabase.from('pg_policies').select('*').eq('tablename', 'categories');
  if (pgPolicies) console.log("Policies encontradas:", pgPolicies.map(p => p.policyname));
}

diagnose();
