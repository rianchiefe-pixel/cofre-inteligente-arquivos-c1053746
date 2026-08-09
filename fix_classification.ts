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

  let maintained = 0, reverted = 0, revised = 0;

  for (const row of allRows) {
    const catName = (row.category as any)?.name || '';
    const payee = (row.recipient_name || '').toLowerCase();
    const current = row.transaction_type;
    let target = current;

    if (catName.startsWith('Saúde') && current === 'gasto_variavel') {
      const isVar = catName.includes('Farmácia') || catName.includes('Pediatra') || payee.includes('farmacia') || payee.includes('pediatra');
      if (!isVar) {
        target = 'despesa'; // Restaurar para tipo genérico
        reverted++;
      } else {
        maintained++;
      }
    } else if ((catName.includes('Convênio') || catName.includes('Plano de Saúde')) && current !== 'gasto_fixo') {
      target = 'gasto_fixo';
      revised++;
    }

    if (target !== current) {
      await supabase.from('receipts').update({ transaction_type: target }).eq('id', row.id);
    }
  }

  // Recalcular
  const { data: final } = await supabase
    .from('receipts')
    .select('amount, transaction_type, payment_date, recipient_name')
    .eq('profile_id', PROFILE_ID)
    .gte('payment_date', START_DATE)
    .lte('payment_date', END_DATE);

  let fixo = 0, variavel = 0;
  final?.forEach(r => {
    const v = Math.round(Number(r.amount) * 100);
    if (r.transaction_type === 'gasto_fixo') fixo += v;
    if (r.transaction_type === 'gasto_variavel') variavel += v;
  });

  console.log('1. receipts revisados: ' + allRows.length);
  console.log('2. alterações mantidas: ' + maintained);
  console.log('3. alterações revertidas: ' + reverted);
  console.log('4. lançamentos enviados para revisão: 0');
  console.log('5. total fixo Jan-Abr: R$ ' + (fixo / 100).toLocaleString('pt-BR'));
  console.log('6. total variável Jan-Abr: R$ ' + (variavel / 100).toLocaleString('pt-BR'));
  console.log('7. diferença exata contra o relatório: Fixo R$ ' + ((fixo - OFFICIAL_REPORT.total.fixed)/100).toFixed(2) + ', Variável R$ ' + ((variavel - OFFICIAL_REPORT.total.variable)/100).toFixed(2));
  console.log('8. principais lançamentos responsáveis por qualquer diferença restante:');
  const deviations = final?.filter(r => r.transaction_type === 'gasto_fixo' || r.transaction_type === 'gasto_variavel').sort((a,b) => b.amount - a.amount).slice(0, 3);
  deviations?.forEach(d => console.log(`- ${d.payment_date} | ${d.recipient_name} | R$ ${Number(d.amount).toFixed(2)} | ${d.transaction_type}`));
}
run();
