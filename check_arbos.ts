import { supabaseAdmin } from './src/integrations/supabase/client.server';

async function main() {
  const profileId = 'c44c244d-b05f-47dc-bc58-7056351e7703'; // Pessoal
  const { data: rows, error } = await supabaseAdmin
    .from('transactions')
    .select('*, categories(name)')
    .eq('profile_id', profileId)
    .eq('txn_date', '2026-06-29')
    .eq('amount', 399600);
  
  if (error) {
    console.error(error);
    return;
  }
  
  console.log("Transações ARBOS encontradas:");
  console.log(JSON.stringify(rows, null, 2));
}

main();
