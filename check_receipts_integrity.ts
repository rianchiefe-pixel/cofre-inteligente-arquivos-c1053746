import { supabaseAdmin } from './src/integrations/supabase/client.server';

async function check() {
  const userId = '53be3bb2-2bbc-4f66-abe7-34fdbf44064e';
  
  // 1. Verificar se receipts tem profile_id e se está correto
  const { data: receipts } = await supabaseAdmin
    .from('receipts')
    .select('id, profile_id, category_id, amount_centavos')
    .eq('profile_id', 'c44c244d-b05f-47dc-bc58-7056351e7703')
    .limit(10);
  
  console.log('Amostra receipts Pessoal Leiliane:', receipts);

  // 2. Tentar encontrar a categoria "Carro" e ver por que os lançamentos não aparecem
  const { data: carroCat } = await supabaseAdmin
    .from('categories')
    .select('id, name')
    .eq('user_id', userId)
    .eq('name', 'Carro')
    .single();

  if (carroCat) {
    console.log('Categoria Carro encontrada:', carroCat.id);
    const { data: recs, count } = await supabaseAdmin
      .from('receipts')
      .select('id, amount_centavos', { count: 'exact' })
      .eq('category_id', carroCat.id);
    
    console.log(`Lançamentos para categoria Carro (${carroCat.id}): ${count}`);
    if (recs && recs.length > 0) {
       const total = recs.reduce((acc, r) => acc + (r.amount_centavos || 0), 0);
       console.log(`Total Carro: R$ ${(total/100).toLocaleString('pt-BR')}`);
    } else {
       // Talvez os receipts estejam com outro category_id que tem nome parecido?
       console.log('Buscando outras categorias com nome Carro...');
       const { data: allCats } = await supabaseAdmin.from('categories').select('id, name').ilike('name', '%Carro%');
       console.log('Categorias "Carro" no banco:', allCats);
    }
  }
}

check();
