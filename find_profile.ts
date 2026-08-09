import { supabaseAdmin } from './src/integrations/supabase/client.server';

async function findProfile() {
  const targetEmail = 'advocacia@leilianepereira.com';
  console.log('--- BUSCANDO CONTA ---');
  
  const { data: { users }, error: authError } = await supabaseAdmin.auth.admin.listUsers();
  if (authError) {
    console.error('Erro Auth:', authError);
    return;
  }
  
  const user = users.find(u => u.email === targetEmail);
  if (!user) {
    console.log('Usuário não encontrado:', targetEmail);
    return;
  }
  
  console.log('auth_user_id:', user.id);

  const { data: profiles, error: profileError } = await supabaseAdmin
    .from('financial_profiles')
    .select('*')
    .eq('user_id', user.id);
    
  if (profileError) {
    console.error('Erro Profiles:', profileError);
    return;
  }

  console.log('\n--- PERFIS ENCONTRADOS ---');
  for (const p of (profiles || [])) {
    const { count: catCount } = await supabaseAdmin
      .from('categories')
      .select('*', { count: 'exact', head: true })
      .eq('profile_id', p.id);
      
    const { count: recCount } = await supabaseAdmin
      .from('receipts')
      .select('*', { count: 'exact', head: true })
      .eq('profile_id', p.id);

    const { data: checkCats } = await supabaseAdmin
      .from('categories')
      .select('name')
      .eq('profile_id', p.id);

    const foundNames = checkCats?.map(c => c.name) || [];
    const validationNames = ['Carro', 'Sala Comercial Leila', 'Casa 26', 'Diarista', 'Educação', 'Farmácia', 'Pensão Alimentícia - Erick'];
    const matched = validationNames.filter(n => foundNames.includes(n));

    console.log(`ID: ${p.id} | Nome: ${p.name} | Cats: ${catCount} | Receipts: ${recCount}`);
    console.log(`Validação: ${matched.join(', ')}`);
    
    if (matched.length > 0) {
       const carroCat = (checkCats || []).find(c => c.name === 'Carro');
       if (carroCat) {
          // Precisamos do ID da categoria Carro para esse perfil
          const { data: realCarroCat } = await supabaseAdmin.from('categories').select('id').eq('profile_id', p.id).eq('name', 'Carro').single();
          if (realCarroCat) {
             const { data: carroReceipts } = await supabaseAdmin.from('receipts').select('amount_centavos').eq('category_id', realCarroCat.id);
             const total = carroReceipts?.reduce((acc, r) => acc + (r.amount_centavos || 0), 0) || 0;
             console.log(`Total Carro: R$ ${(total/100).toLocaleString('pt-BR')} | Lançamentos: ${carroReceipts?.length}`);
          }
       }
    }
    console.log('---');
  }
}

findProfile();
