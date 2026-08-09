import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function run() {
  const email = 'advocacia@leilianepereira.com.br';
  const { data: authUser } = await supabase.auth.admin.listUsers();
  const user = authUser?.users.find(u => u.email === email);
  if (!user) return;

  const { data: profiles } = await supabase.from('financial_profiles').select('id, name').eq('user_id', user.id);
  const pessoal = profiles?.find(p => p.name === 'Pessoal');
  
  const { data: receipts } = await supabase
    .from('receipts')
    .select('id, category_id, profile_id')
    .eq('profile_id', pessoal?.id)
    .not('category_id', 'is', null)
    .limit(10);
    
  console.log("Perfil Pessoal:", pessoal?.id);
  console.log("Lançamentos com categoria em Pessoal:", receipts?.length);
  
  if (receipts && receipts.length > 0) {
    const catIds = receipts.map(r => r.category_id);
    const { data: cats } = await supabase.from('categories').select('*').in('id', catIds);
    console.log("Categorias encontradas no banco para esses IDs:");
    cats?.forEach(c => {
       console.log(`- ID: ${c.id} | Nome: ${c.name} | User: ${c.user_id} | Arch: ${c.archived}`);
    });
  }
}
run();
