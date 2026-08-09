import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const profileId = 'c44c244d-b05f-47dc-bc58-7056351e7703';

  const { data: receipts } = await supabase
    .from('receipts')
    .select('transaction_type')
    .eq('profile_id', profileId)
    .limit(100);

  const types = [...new Set(receipts?.map(r => r.transaction_type))];
  console.log('Unique transaction types in receipts:', types);
}

run();
