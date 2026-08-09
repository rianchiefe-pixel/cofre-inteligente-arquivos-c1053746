import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const profileId = 'c44c244d-b05f-47dc-bc58-7056351e7703'; // Pessoal / Leiliane
  
  // Check if categories exist
  const { data: categories, error: catError } = await supabase
    .from('categories')
    .select('id, name')
    .eq('profile_id', profileId)
    .ilike('name', '%Educação%');

  console.log('Categories like Educação:', categories);

  const { count: receiptCount } = await supabase
    .from('receipts')
    .select('*', { count: 'exact', head: true })
    .eq('profile_id', profileId);

  const { count: categoryCount } = await supabase
    .from('categories')
    .select('*', { count: 'exact', head: true })
    .eq('profile_id', profileId);

  console.log('Profile ID:', profileId);
  console.log('Receipt Count:', receiptCount);
  console.log('Category Count:', categoryCount);
}

run();
