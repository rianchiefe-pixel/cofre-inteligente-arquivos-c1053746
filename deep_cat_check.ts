import { supabaseAdmin } from './src/integrations/supabase/client.server';

async function check() {
  const userId = '53be3bb2-2bbc-4f66-abe7-34fdbf44064e';
  
  // Buscar a categoria Carro
  const { data: carroCat } = await supabaseAdmin
    .from('categories')
    .select('id, name')
    .eq('user_id', userId)
    .eq('name', 'Carro')
    .single();

  if (carroCat) {
    console.log('Categoria Carro ID:', carroCat.id);
    
    // Buscar no import_rows
    const { count: irCount } = await supabaseAdmin
      .from('import_rows')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .ilike('category', '%Carro%');
    
    console.log('Import Rows com termo "Carro":', irCount);

    // Buscar no receipts SEM FILTRO DE PROFILE_ID (apenas user e category)
    const { data: recs, count } = await supabaseAdmin
      .from('receipts')
      .select('id, amount, profile_id', { count: 'exact' })
      .eq('user_id', userId)
      .eq('category_id', carroCat.id);
    
    console.log(`Receipts para Carro: ${count}`);
    if (recs) {
       console.log('Amostra receipts Carro:', recs.slice(0, 3));
       const total = recs.reduce((acc, r) => acc + (Number(r.amount) || 0), 0);
       console.log(`Total Carro (amount): R$ ${total.toLocaleString('pt-BR')}`);
    }
  }

  // Buscar categoria "Sala Comercial Leila"
  const { data: salaCat } = await supabaseAdmin
    .from('categories')
    .select('id, name')
    .eq('user_id', userId)
    .eq('name', 'Sala Comercial Leila')
    .single();
    
  if (salaCat) {
     const { count } = await supabaseAdmin
      .from('receipts')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('category_id', salaCat.id);
     console.log(`Receipts para Sala Comercial Leila: ${count}`);
  }
}

check();
