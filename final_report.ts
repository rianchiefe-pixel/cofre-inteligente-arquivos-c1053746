import { supabaseAdmin } from './src/integrations/supabase/client.server';

async function report() {
  const userId = '53be3bb2-2bbc-4f66-abe7-34fdbf44064e';
  const profileId = 'c44c244d-b05f-47dc-bc58-7056351e7703';
  
  const { count: catCount } = await supabaseAdmin.from('categories').select('*', { count: 'exact', head: true }).eq('user_id', userId);
  const { count: recCount } = await supabaseAdmin.from('receipts').select('*', { count: 'exact', head: true }).eq('profile_id', profileId);

  console.log('--- RELATÓRIO FINAL ---');
  console.log('Email: advocacia@leilianepereira.com.br');
  console.log('Profile ID:', profileId);
  console.log('Categorias:', catCount);
  console.log('Receipts:', recCount);

  const validation = ['Carro', 'Sala Comercial Leila', 'Casa 26', 'Diarista', 'Educação', 'Farmácia', 'Pensão Alimentícia - Erick'];
  for (const v of validation) {
     const { data: cat } = await supabaseAdmin.from('categories').select('id').eq('user_id', userId).eq('name', v).maybeSingle();
     if (cat) {
        const { data: recs } = await supabaseAdmin.from('receipts').select('amount').eq('category_id', cat.id).eq('profile_id', profileId);
        const total = recs?.reduce((acc, r) => acc + (Number(r.amount) || 0), 0) || 0;
        console.log(`- ${v}: ${recs?.length} lanc. | R$ ${total.toLocaleString('pt-BR')}`);
     }
  }
}
report();
