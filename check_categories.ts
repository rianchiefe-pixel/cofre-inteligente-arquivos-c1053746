import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const profileId = 'c44c244d-b05f-47dc-bc58-7056351e7703';
  
  // Try fetching all categories for this profile without name filter
  const { data: categories, error } = await supabase
    .from('categories')
    .select('id, name, profile_id, user_id')
    .eq('profile_id', profileId);

  if (error) {
    console.error('Error fetching categories:', error);
  } else {
    console.log('Categories Count:', categories?.length);
    console.log('First 5 Categories:', categories?.slice(0, 5));
  }
}

run();
