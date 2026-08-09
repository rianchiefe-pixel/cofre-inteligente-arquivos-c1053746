import { supabaseAdmin } from './src/integrations/supabase/client.server';

async function run() {
  const { data: users, error: userError } = await supabaseAdmin.auth.admin.listUsers();
  if (userError) {
    console.error('Erro ao listar usuários:', userError);
    return;
  }
  
  const user = users.users.find(u => u.email === 'advocacia@leilianepereira.com');
  if (!user) {
    console.error('Usuário não encontrado');
    return;
  }
  
  console.log('User ID:', user.id);
  
  const { data: profiles, error: profileError } = await supabaseAdmin
    .from('financial_profiles')
    .select('id, name')
    .eq('user_id', user.id);
    
  if (profileError) {
    console.error('Erro ao buscar perfis:', profileError);
  } else {
    console.log('Profiles:', JSON.stringify(profiles, null, 2));
  }

  // Verificar o caso ARBOS de teste
  const { data: testArbos, error: arbosError } = await supabaseAdmin
    .from('receipts')
    .select('id, payment_date, recipient_name, amount, profile_id, category_id')
    .eq('user_id', user.id)
    .ilike('recipient_name', '%ARBOS%')
    .eq('amount', 399600) // Assumindo centavos
    .gte('payment_date', '2026-04-01')
    .lte('payment_date', '2026-04-10');

  console.log('Teste ARBOS (05/04):', JSON.stringify(testArbos, null, 2));
  
  if (testArbos && testArbos.length > 0 && testArbos[0].category_id) {
    const { data: cat } = await supabaseAdmin.from('categories').select('name').eq('id', testArbos[0].category_id).single();
    console.log('Categoria atual ARBOS:', cat?.name);
  }
}

run();
