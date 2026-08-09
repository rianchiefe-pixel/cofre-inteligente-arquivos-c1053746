import { supabaseAdmin } from './src/integrations/supabase/client.server';

async function main() {
  const { data: receipts, error } = await supabaseAdmin
    .from('receipts')
    .select('id, description, amount, txn_date, profile_id, category_id, categories(name)')
    .eq('profile_id', 'c44c244d-b05f-47dc-bc58-7056351e7703')
    .eq('txn_date', '2026-06-29')
    .eq('amount', 399600);
  
  if (error) {
    console.error(error);
    return;
  }
  
  console.log(JSON.stringify(receipts, null, 2));
}

main();
