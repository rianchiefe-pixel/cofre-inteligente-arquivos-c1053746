import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkRLS() {
  console.log("--- RLS Policies for 'categories' ---");
  const { data: policies, error } = await supabase.rpc('get_policies_for_table', { t_name: 'categories' }).catch(() => ({ data: null, error: 'RPC failed' }));
  
  // Fallback to direct query if RPC doesn't exist
  const { data: pgPolicies } = await supabase
    .from('pg_policies')
    .select('*')
    .eq('tablename', 'categories');
  
  if (pgPolicies) {
    pgPolicies.forEach(p => {
      console.log(`Policy: ${p.policyname} | Action: ${p.cmd} | Qualifier: ${p.qual} | Roles: ${p.roles}`);
    });
  } else {
    console.log("Could not fetch policies via pg_policies. Table might be public or locked.");
  }

  // Check if categories are tied to a specific profile_id in the schema
  const { data: columns } = await supabase.from('information_schema.columns')
    .select('column_name')
    .eq('table_name', 'categories')
    .eq('table_schema', 'public');
  
  console.log("\n--- Categories Columns ---");
  console.log(columns?.map(c => c.column_name).join(', '));
}

checkRLS();
