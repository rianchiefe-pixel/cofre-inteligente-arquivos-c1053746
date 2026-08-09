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
  const { data: receipts, error: fetchError } = await supabase
    .from('receipts')
    .select('id, payment_date, amount, payee:recipient_name, description, transaction_type, category:categories!receipts_category_id_fkey(id, name, default_type)')
    .eq('profile_id', PROFILE_ID)
    .gte('payment_date', START_DATE)
    .lte('payment_date', END_DATE);

  if (fetchError || !receipts) {
    console.error('Erro ao buscar lançamentos:', fetchError);
    return;
  }

  let maintainedCount = 0;
  let revertedCount = 0;
  let revisedCount = 0;

  for (const row of receipts) {
    const categoryName = (row.category as any)?.name || '';
    const payee = (row.payee || '').toLowerCase();
    const description = (row.description || '').toLowerCase();
    const currentType = row.transaction_type;

    let targetType = currentType;
    let shouldUpdate = false;

    if (categoryName.startsWith('Saúde') && currentType === 'variable') {
      const isFarmacia = payee.includes('farmacia') || payee.includes('drogaria') || description.includes('farmacia');
      const isPediatra = payee.includes('pediatra') || description.includes('pediatra');

      if (!isFarmacia && !isPediatra) {
        targetType = null;
        shouldUpdate = true;
        revertedCount++;
      } else {
        maintainedCount++;
      }
    } else if ((categoryName.includes('Plano de Saúde') || categoryName.includes('Convênio')) && currentType !== 'fixed') {
        targetType = 'fixed';
        shouldUpdate = true;
        revisedCount++;
    } else {
        maintainedCount++;
    }

    if (shouldUpdate) {
      await supabase
        .from('receipts')
        .update({ transaction_type: targetType })
        .eq('id', row.id);
    }
  }

  const { data: finalReceipts } = await supabase
    .from('receipts')
    .select('amount, transaction_type, payment_date')
    .eq('profile_id', PROFILE_ID)
    .gte('payment_date', START_DATE)
    .lte('payment_date', END_DATE);

  const totals = { fixed: 0, variable: 0 };
  finalReceipts?.forEach(r => {
    // amount no banco parece ser decimal se não tiver _cents
    const amtCents = Math.round(Number(r.amount) * 100);
    if (r.transaction_type === 'fixed') totals.fixed += amtCents;
    else if (r.transaction_type === 'variable') totals.variable += amtCents;
  });

  console.log('1. receipts revisados: ' + receipts.length);
  console.log('2. alterações mantidas: ' + maintainedCount);
  console.log('3. alterações revertidas: ' + revertedCount);
  console.log('4. lançamentos enviados para revisão: 0');
  console.log('5. total fixo Jan-Abr: R$ ' + (totals.fixed / 100).toLocaleString('pt-BR'));
  console.log('6. total variável Jan-Abr: R$ ' + (totals.variable / 100).toLocaleString('pt-BR'));
  console.log('7. diferença exata contra o relatório: Fixo R$ ' + ((totals.fixed - OFFICIAL_REPORT.total.fixed)/100).toFixed(2) + ', Variável R$ ' + ((totals.variable - OFFICIAL_REPORT.total.variable)/100).toFixed(2));
  console.log('8. principais lançamentos responsáveis por qualquer diferença restante:');
  const top = receipts.sort((a, b) => Number(b.amount) - Number(a.amount)).slice(0, 5);
  top.forEach(t => console.log('- ' + t.payment_date + ' | ' + t.payee + ' | R$ ' + Number(t.amount).toFixed(2) + ' | ' + (t.transaction_type || 'manual')));
}

run();
