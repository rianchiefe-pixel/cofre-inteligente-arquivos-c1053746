import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const PROFILE_ID = 'c44c244d-b05f-47dc-bc58-7056351e7703';
const START_DATE = '2026-01-01';
const END_DATE = '2026-04-30';

const OFFICIAL_REPORT = {
  total: { fixed: 8673748, variable: 11520598 }
};

async function run() {
  const { data: allRows } = await supabase
    .from('receipts')
    .select('id, amount, transaction_type, payment_date, recipient_name, category:categories!receipts_category_id_fkey(name)')
    .eq('profile_id', PROFILE_ID)
    .gte('payment_date', START_DATE)
    .lte('payment_date', END_DATE);

  if (!allRows) return;

  console.log('Total de registros encontrados:', allRows.length);
  const types = allRows.reduce((acc: any, curr) => {
    acc[curr.transaction_type] = (acc[curr.transaction_type] || 0) + 1;
    return acc;
  }, {});
  console.log('Tipos presentes:', types);

  let fixo = 0, variavel = 0;
  allRows.forEach(r => {
    const v = Math.round(Number(r.amount) * 100);
    // Se no banco estiver como 'expense_fixed' ou 'expense_variable'
    if (r.transaction_type === 'fixed' || r.transaction_type === 'expense_fixed') fixo += v;
    if (r.transaction_type === 'variable' || r.transaction_type === 'expense_variable') variavel += v;
  });

  console.log('Soma Fixo:', fixo);
  console.log('Soma Variável:', variavel);

  // Se o transaction_type não for o campo que o sistema usa para o relatório, vamos ver 'is_fixed'
  let fixoByFlag = 0;
  allRows.forEach(r => {
    const v = Math.round(Number(r.amount) * 100);
    if ((r as any).is_fixed === true) fixoByFlag += v;
  });
  console.log('Soma Fixo (via flag is_fixed):', fixoByFlag);
}
run();
