import { supabaseAdmin } from './src/integrations/supabase/client.server';

const USER_ID = '53be3bb2-2bbc-4f66-abe7-34fdbf44064e';

async function run() {
  console.log('--- VALIDAÇÃO PÓS-UPDATE ---');
  
  // TESTE 1: ARBOS 05/04/2026 - R$ 3.996,00
  const { data: test1 } = await supabaseAdmin
    .from('receipts')
    .select('id, amount, payment_date, recipient_name, category_id')
    .eq('user_id', USER_ID)
    .eq('amount', 3996)
    .gte('payment_date', '2026-04-04')
    .lte('payment_date', '2026-04-06');
    
  for (const t of (test1 || [])) {
    const { data: c } = await supabaseAdmin.from('categories').select('name').eq('id', t.category_id).single();
    console.log(`TESTE 1 (ARBOS ${t.payment_date}): Categoria = ${c?.name} (Esperado: Educação)`);
  }

  // TESTE 2: Cantina 30/03/2026 - R$ 800,00
  const { data: test2 } = await supabaseAdmin
    .from('receipts')
    .select('id, amount, payment_date, recipient_name, category_id')
    .eq('user_id', USER_ID)
    .eq('amount', 800)
    .gte('payment_date', '2026-03-29')
    .lte('payment_date', '2026-03-31');
    
  for (const t of (test2 || [])) {
    const { data: c } = await supabaseAdmin.from('categories').select('name').eq('id', t.category_id).single();
    console.log(`TESTE 2 (CANTINA ${t.payment_date}): Categoria = ${c?.name} (Esperado: Restaurante Escolar)`);
  }
}

run();
