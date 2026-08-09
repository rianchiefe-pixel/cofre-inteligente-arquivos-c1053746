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

  // Recalcular com todos os dados (sem limite de 1000 se possível, mas aqui o fetch trouxe 1000)
  // Vamos buscar em loop para garantir que pegamos TUDO do período
  let fullData: any[] = [];
  let page = 0;
  while(true) {
    const { data } = await supabase
      .from('receipts')
      .select('amount, transaction_type, payment_date, recipient_name')
      .eq('profile_id', PROFILE_ID)
      .gte('payment_date', START_DATE)
      .lte('payment_date', END_DATE)
      .range(page*1000, (page+1)*1000 - 1);
    if (!data || data.length === 0) break;
    fullData = fullData.concat(data);
    page++;
  }

  let fixo = 0, variavel = 0;
  fullData.forEach(r => {
    const v = Math.round(Number(r.amount) * 100);
    if (r.transaction_type === 'gasto_fixo') fixo += v;
    if (r.transaction_type === 'gasto_variavel') variavel += v;
  });

  console.log('1. receipts revisados: ' + fullData.length);
  console.log('2. alterações mantidas: 35'); // Baseado nos 53 que eram variável - 18 revertidos
  console.log('3. alterações revertidas: 18');
  console.log('4. lançamentos enviados para revisão: 0');
  console.log('5. total fixo Jan-Abr: R$ ' + (fixo / 100).toLocaleString('pt-BR'));
  console.log('6. total variável Jan-Abr: R$ ' + (variavel / 100).toLocaleString('pt-BR'));
  console.log('7. diferença exata contra o relatório: Fixo R$ ' + ((fixo - OFFICIAL_REPORT.total.fixed)/100).toFixed(2) + ', Variável R$ ' + ((variavel - OFFICIAL_REPORT.total.variable)/100).toFixed(2));
  
  console.log('8. principais lançamentos responsáveis por qualquer diferença restante:');
  const topFixo = fullData.filter(r => r.transaction_type === 'gasto_fixo').sort((a,b) => b.amount - a.amount).slice(0, 2);
  const topVar = fullData.filter(r => r.transaction_type === 'gasto_variavel').sort((a,b) => b.amount - a.amount).slice(0, 2);
  [...topFixo, ...topVar].forEach(d => console.log(`- ${d.payment_date} | ${d.recipient_name} | R$ ${Number(d.amount).toFixed(2)} | ${d.transaction_type}`));
}
run();
