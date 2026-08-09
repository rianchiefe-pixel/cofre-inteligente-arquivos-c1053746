import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data, error } = await supabase
    .from('receipts')
    .select('*')
    .limit(1);

  if (error) {
    console.error(error);
  } else {
    console.log('Receipt columns:', Object.keys(data[0]));
  }
}

run();
