import { supabaseAdmin } from './src/integrations/supabase/client.server';

async function main() {
  const profileId = 'c44c244d-b05f-47dc-bc58-7056351e7703'; // Pessoal
  const { data: receipts } = await supabaseAdmin
    .from('receipts')
    .select('id, recipient_name, amount, payment_date, auth_code')
    .eq('profile_id', profileId)
    .gte('payment_date', '2026-05-01')
    .lte('payment_date', '2026-06-30')
    .order('payment_date');
  
  console.log(`Encontrados ${receipts?.length} lançamentos no banco para o período.`);
  console.log("Exemplos:");
  console.log(JSON.stringify(receipts?.slice(0, 10), null, 2));
}

main();
