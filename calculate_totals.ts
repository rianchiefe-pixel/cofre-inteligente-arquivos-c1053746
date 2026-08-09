import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const profileId = 'c44c244d-b05f-47dc-bc58-7056351e7703';

  const { data: receipts } = await supabase
    .from('receipts')
    .select('amount, transaction_type, payment_date, category_id')
    .eq('profile_id', profileId)
    .gte('payment_date', '2026-01-01')
    .lte('payment_date', '2026-04-30');

  if (!receipts) return;

  const categoryIds = [...new Set(receipts.map(r => r.category_id).filter(Boolean))];
  const { data: categories } = await supabase
    .from('categories')
    .select('id, name, default_type')
    .in('id', categoryIds as string[]);

  const catMap = new Map(categories?.map(c => [c.id, c]));

  let totalFixos = 0;
  let totalVariaveis = 0;

  for (const r of receipts) {
    const cat = r.category_id ? catMap.get(r.category_id) : null;
    const type = cat?.default_type || r.transaction_type;
    
    if (type === 'gasto_fixo') totalFixos += Number(r.amount);
    if (type === 'gasto_variavel') totalVariaveis += Number(r.amount);
  }

  console.log('Total Fixos:', totalFixos);
  console.log('Total Variáveis:', totalVariaveis);
}

run();
