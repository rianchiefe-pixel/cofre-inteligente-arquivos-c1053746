import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkRLS() {
  console.log("--- Categories Table Structure ---");
  const { data: columns } = await supabase.rpc('get_table_columns', { t_name: 'categories' }).catch(() => ({ data: null }));
  
  // If RPC fails, try generic query
  const { data: infoCols } = await supabase.from('pg_attribute')
    .select('attname')
    .eq('attrelid', "'public.categories'::regclass")
    .eq('attnum', '>0')
    .is('attisdropped', false);

  console.log("Columns:", infoCols?.map(c => c.attname).join(', ') || "Could not fetch columns directly");

  console.log("\n--- Checking RLS via pg_policies ---");
  const { data: pgPolicies, error: polError } = await supabase
    .rpc('exec_sql', { sql_query: "SELECT * FROM pg_policies WHERE tablename = 'categories'" })
    .catch(() => ({ data: null }));

  if (pgPolicies) {
    console.table(pgPolicies);
  } else {
    // Try one more way
    const { data: rawPolicies } = await supabase.from('pg_policies').select('*').eq('tablename', 'categories');
    if (rawPolicies) console.table(rawPolicies);
    else console.log("RLS check failed. Permissions likely restricted.");
  }
  
  // FINAL TEST: Check if any category has a profile_id
  const { data: sampleCats } = await supabase.from('categories').select('*').limit(1);
  if (sampleCats && sampleCats.length > 0) {
    console.log("\n--- Sample Category Record ---");
    console.log(JSON.stringify(sampleCats[0], null, 2));
  }
}

checkRLS();
