import { supabaseAdmin } from './src/integrations/supabase/client.server';

async function main() {
  const profileId = 'c44c244d-b05f-47dc-bc58-7056351e7703';
  const { data: receipts } = await supabaseAdmin
    .from('receipts')
    .select('id, recipient_name, amount, payment_date, auth_code')
    .eq('profile_id', profileId)
    .eq('amount', 3996)
    .gte('payment_date', '2026-05-01')
    .lte('payment_date', '2026-06-30');
  
  console.log(JSON.stringify(receipts, null, 2));
}

main();
