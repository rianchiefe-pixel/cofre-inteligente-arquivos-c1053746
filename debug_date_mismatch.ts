import { supabaseAdmin } from './src/integrations/supabase/client.server';

async function main() {
  const profileId = 'c44c244d-b05f-47dc-bc58-7056351e7703'; // Pessoal
  const { data: receipts } = await supabaseAdmin
    .from('receipts')
    .select('id, recipient_name, amount, payment_date, auth_code, created_at')
    .eq('profile_id', profileId)
    .eq('amount', 399600); // ARBOS
  
  console.log(JSON.stringify(receipts, null, 2));
}

main();
