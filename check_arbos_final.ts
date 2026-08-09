import { supabaseAdmin } from './src/integrations/supabase/client.server';

async function main() {
  const { data: receipts } = await supabaseAdmin
    .from('receipts')
    .select('id, recipient_name, amount, payment_date, profile_id, category_id, categories(name), auth_code')
    .ilike('recipient_name', '%ARBOS%')
    .eq('amount', 3996);
  
  console.log(JSON.stringify(receipts, null, 2));
}

main();
