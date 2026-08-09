import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const profileId = 'c44c244d-b05f-47dc-bc58-7056351e7703';

  const { data: receipts } = await supabase
    .from('receipts')
    .select('payment_date, amount, transaction_type, recipient_name, description')
    .eq('profile_id', profileId)
    .gte('payment_date', '2026-01-01')
    .lte('payment_date', '2026-04-30')
    .order('payment_date', { ascending: true });

  if (!receipts) return;

  const months = ['2026-01', '2026-02', '2026-03', '2026-04'];
  const report: any = {};

  months.forEach(m => {
    report[m] = { fixos: 0, variaveis: 0 };
  });

  receipts.forEach(r => {
    const m = r.payment_date?.substring(0, 7);
    if (report[m]) {
      if (r.transaction_type === 'gasto_fixo') report[m].fixos += Number(r.amount);
      if (r.transaction_type === 'gasto_variavel') report[m].variaveis += Number(r.amount);
    }
  });

  console.log('Monthly totals (Jan-Apr 2026):', report);
}

run();
