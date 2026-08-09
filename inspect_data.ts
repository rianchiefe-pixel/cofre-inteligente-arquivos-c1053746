import { supabaseAdmin } from './src/integrations/supabase/client.server';

async function run() {
  const USER_ID = '53be3bb2-2bbc-4f66-abe7-34fdbf44064e';
  
  // Ver um lançamento qualquer para entender o formato dos dados
  const { data: sample } = await supabaseAdmin
    .from('receipts')
    .select('*')
    .eq('user_id', USER_ID)
    .limit(1);
    
  console.log('Sample Record:', JSON.stringify(sample, null, 2));

  // Buscar ARBOS especificamente
  const { data: arbos } = await supabaseAdmin
    .from('receipts')
    .select('id, amount, payment_date, recipient_name, auth_code, profile_id')
    .eq('user_id', USER_ID)
    .ilike('recipient_name', '%ARBOS%');
    
  console.log('ARBOS Records:', JSON.stringify(arbos, null, 2));
}

run();
