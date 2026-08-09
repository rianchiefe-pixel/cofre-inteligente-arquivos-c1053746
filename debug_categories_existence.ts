import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function run() {
  console.log("--- DEBUG START ---");
  
  // 1. Identificar o usuário (pelo email fornecido no prompt)
  const { data: authUser, error: authError } = await supabase.auth.admin.listUsers();
  const user = authUser?.users.find(u => u.email === 'advocacia@leilianepereira.com.br' || u.email === 'advocacia@leilianepereira.com');
  
  if (!user) {
    console.log("Usuário não encontrado via email.");
    return;
  }
  
  const userId = user.id;
  console.log("User ID:", userId);

  // 2. Perfis do usuário
  const { data: profiles } = await supabase
    .from('financial_profiles')
    .select('id, name')
    .eq('user_id', userId);
  
  console.log("Perfis Encontrados:", JSON.stringify(profiles, null, 2));
  
  const pessoalProfile = profiles?.find(p => p.name.toLowerCase() === 'pessoal');
  console.log("Perfil Pessoal ID:", pessoalProfile?.id);

  // 3. Contagem direta de categorias
  const { data: allCats } = await supabase
    .from('categories')
    .select('id, name, parent_id, archived, user_id, default_type')
    .eq('user_id', userId);
  
  console.log("Total Geral Categorias no Banco:", allCats?.length || 0);

  // 4. Verificar se a tabela categories possui profile_id (investigação do schema real)
  const { data: sampleCat } = await supabase.from('categories').select('*').limit(1);
  if (sampleCat && sampleCat[0]) {
    console.log("Colunas em 'categories':", Object.keys(sampleCat[0]).join(', '));
  }

  // 5. Verificar lançamentos do perfil Pessoal e suas categorias
  if (pessoalProfile) {
    const { data: recs } = await supabase
      .from('receipts')
      .select('id, category_id, amount')
      .eq('profile_id', pessoalProfile.id)
      .limit(10);
    
    console.log("Amostra de Lançamentos (Pessoal):", recs?.length || 0);
    const catIds = [...new Set(recs?.map(r => r.category_id).filter(Boolean))];
    
    if (catIds.length > 0) {
      const { data: linkedCats } = await supabase
        .from('categories')
        .select('id, name')
        .in('id', catIds);
      console.log("Nomes de categorias usadas em Pessoal:", linkedCats?.map(c => c.name).join(', '));
    }
  }

  console.log("--- DEBUG END ---");
}
run();
