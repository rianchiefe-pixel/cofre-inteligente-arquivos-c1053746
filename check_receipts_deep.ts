import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const profileId = 'c44c244d-b05f-47dc-bc58-7056351e7703';

  // Total receipts in period
  const { data: receipts, error } = await supabase
    .from('receipts')
    .select('id, amount_centavos, transaction_type, date, category_id')
    .eq('profile_id', profileId)
    .gte('date', '2026-01-01')
    .lte('date', '2026-04-30');

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log('Total receipts in period:', receipts?.length);
  
  const byType: any = {};
  receipts?.forEach(r => {
    byType[r.transaction_type] = (byType[r.transaction_type] || 0) + r.amount_centavos;
  });

  console.log('Totals by transaction_type (raw):', byType);

  // Check categories for these receipts
  const categoryIds = [...new Set(receipts?.map(r => r.category_id).filter(Boolean))];
  const { data: categories } = await supabase
    .from('categories')
    .select('id, name, default_type')
    .in('id', categoryIds as string[]);

  const catMap = new Map(categories?.map(c => [c.id, c]));

  let remappedFixos = 0;
  let remappedVariaveis = 0;

  receipts?.forEach(r => {
    const cat = r.category_id ? catMap.get(r.category_id) : null;
    const type = cat?.default_type || r.transaction_type;
    
    if (type === 'gasto_fixo') remappedFixos += r.amount_centavos;
    if (type === 'gasto_variavel') remappedVariaveis += r.amount_centavos;
  });

  console.log('Totals after category mapping (Jan-Apr):');
  console.log('Fixos:', remappedFixos / 100);
  console.log('Variáveis:', remappedVariaveis / 100);
}

run();
