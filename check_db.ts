import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_ANON_KEY!
);

async function run() {
  const { data: auth, error: authErr } = await supabase.from('user_roles').select('*');
  console.log('Roles:', auth?.length, authErr?.message);
  
  const { data: profs, error: profsErr } = await supabase.from('financial_profiles').select('*');
  console.log('Profiles:', profs?.length, profsErr?.message);

  const { data: cats, error: catsErr } = await supabase.from('categories').select('*');
  console.log('Categories:', cats?.length, catsErr?.message);
}
run();
