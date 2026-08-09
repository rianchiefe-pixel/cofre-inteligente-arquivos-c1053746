import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  // 1. Find user by email
  const { data: users, error: userError } = await supabase
    .from('profiles')
    .select('id, email')
    .ilike('email', 'advocacia@leilianepereira.com.br');

  if (userError || !users || users.length === 0) {
    console.error('User not found:', userError);
    return;
  }
  
  const authUserId = users[0].id;
  console.log('Auth User ID:', authUserId);

  // 2. Find Pessoal profile for this user
  const { data: profiles, error: profileError } = await supabase
    .from('financial_profiles')
    .select('id, name, user_id')
    .eq('user_id', authUserId)
    .ilike('name', '%Pessoal%');

  if (profileError || !profiles || profiles.length === 0) {
    console.error('Profile Pessoal not found:', profileError);
    return;
  }

  const profileId = profiles[0].id;
  const profileName = profiles[0].name;
  console.log('Profile ID:', profileId);
  console.log('Profile Name:', profileName);

  // 3. Stats
  const { count: receiptCount } = await supabase
    .from('receipts')
    .select('*', { count: 'exact', head: true })
    .eq('profile_id', profileId);

  const { count: categoryCount } = await supabase
    .from('categories')
    .select('*', { count: 'exact', head: true })
    .eq('profile_id', profileId);

  console.log('Receipt Count:', receiptCount);
  console.log('Category Count:', categoryCount);
}

run();
