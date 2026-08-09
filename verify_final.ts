import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function run() {
  const userId = '53be3bb2-2bbc-4f66-abe7-34fdbf44064e';
  const { data: cats } = await supabase.from('categories').select('id').eq('user_id', userId);
  console.log("Categorias encontradas para o usuário final:", cats?.length);
  
  const { data: recs } = await supabase.from('receipts').select('id, category_id').eq('profile_id', 'c44c244d-b05f-47dc-bc58-7056351e7703').limit(5);
  console.log("Lançamentos do Pessoal possuem vínculo:", recs?.every(r => r.category_id !== null));
}
run();
