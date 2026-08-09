import { supabaseAdmin } from './src/integrations/supabase/client.server';

async function fix() {
  const userId = '53be3bb2-2bbc-4f66-abe7-34fdbf44064e';
  const profileId = 'c44c244d-b05f-47dc-bc58-7056351e7703';

  // 1. Corrigir profile_id de TODOS os receipts do usuário
  console.log('Corrigindo profile_id dos receipts...');
  const { data: updated, error } = await supabaseAdmin
    .from('receipts')
    .update({ profile_id: profileId })
    .eq('user_id', userId);
  
  if (error) console.error(error);
  else console.log('Profile_id dos receipts atualizado.');

  // 2. Tentar calcular novamente o valor do Carro
  const { data: carroCat } = await supabaseAdmin.from('categories').select('id').eq('user_id', userId).eq('name', 'Carro').single();
  if (carroCat) {
     const { data: recs } = await supabaseAdmin.from('receipts').select('amount').eq('category_id', carroCat.id).eq('profile_id', profileId);
     const total = recs?.reduce((acc, r) => acc + (Number(r.amount) || 0), 0) || 0;
     console.log(`Carro: ${recs?.length} lançamentos | Total: R$ ${total.toLocaleString('pt-BR')}`);
  }
}
fix();
