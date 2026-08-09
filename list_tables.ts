import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data, error } = await supabase
    .from('financial_profiles')
    .select('id, name, user_id')
    .limit(10);

  if (error) {
    console.error('Error fetching profiles:', error);
  } else {
    console.log('Profiles found:', data);
  }
}

run();
