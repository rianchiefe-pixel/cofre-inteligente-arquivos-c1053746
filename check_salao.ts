import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
async function run() {
  const { data: recs } = await supabase.from('receipts').select('id, category_id, recipient_name, amount').ilike('recipient_name', '%leila%');
  const { data: cats } = await supabase.from('categories').select('id, name');
  const catMap = new Map(cats?.map(c => [c.id, c.name]));
  
  recs?.forEach(r => {
    console.log(`Rec: ${r.recipient_name} | Cat: ${catMap.get(r.category_id!)} | Amt: ${r.amount}`);
  });
}
run();
