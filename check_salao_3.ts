import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
async function run() {
  const { data: recs } = await supabase.from('receipts').select('id, category_id, recipient_name, amount').in('category_id', ['fa83ddce-4827-4243-8641-4e637c740820']);
  recs?.forEach(r => {
     console.log(`ID: ${r.id} | Fav: ${r.recipient_name} | Amt: ${r.amount}`);
  });
}
run();
