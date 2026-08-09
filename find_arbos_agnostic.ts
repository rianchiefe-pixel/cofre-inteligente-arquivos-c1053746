import { supabaseAdmin } from './src/integrations/supabase/client.server';

async function main() {
  const { data: receipts } = await supabaseAdmin
    .from('receipts')
    .select('id, recipient_name, amount, payment_date, auth_code, profile_id')
    .ilike('recipient_name', '%ARBOS%')
    .order('payment_date');
  
  console.log(JSON.stringify(receipts, null, 2));
}

main();
