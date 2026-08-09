import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_ANON_KEY!
);

async function run() {
  const { data: { user }, error } = await supabase.auth.getUser();
  console.log('Current User:', user?.id, user?.email);
  if (error) console.log('Auth Error:', error.message);
  
  const { data: users, error: listErr } = await supabase.from('user_roles').select('user_id');
  console.log('Total user_roles rows:', users?.length, listErr?.message);
}
run();
