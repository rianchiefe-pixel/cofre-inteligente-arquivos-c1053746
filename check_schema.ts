import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data, error } = await supabase.rpc('get_table_info', { table_name: 'categories' });
  
  // Since I don't know if get_table_info exists, let's just fetch one row from categories
  const { data: row, error: rowError } = await supabase
    .from('categories')
    .select('*')
    .limit(1);

  if (rowError) {
    console.error('Error fetching row:', rowError);
  } else {
    console.log('Category row keys:', Object.keys(row[0]));
    console.log('Category row data:', row[0]);
  }
}

run();
