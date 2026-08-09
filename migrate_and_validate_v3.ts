import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const PROFILE_ID = 'c44c244d-b05f-47dc-bc58-7056351e7703';
const START_DATE = '2026-01-01';
const END_DATE = '2026-04-30';

const OFFICIAL_REPORT = {
  jan: { expense: 7279470, investment: 12973489, fixed: 1630579, variable: 1873848 },
  feb: { expense: 18520886, investment: 36437633, fixed: 2332566, variable: 2932032 },
  mar: { expense: 13674405, investment: 16808422, fixed: 2360641, variable: 3391858 },
  apr: { expense: 11891385, investment: 29767982, fixed: 2349962, variable: 3322860 }
};

const FAMILIES = {
  fixed: ['Academia', 'APAE', 'Condomínio', 'Educação', 'Internet', 'Telefone', 'Pensão alimentícia', 'Plano de Saúde', 'Convênio', 'Seguro'],
  variable: ['Alimentação', 'Combustível', 'Diarista', 'Farmácia', 'Personal', 'Pediatria']
};

async function run() {
  console.log('--- Iniciando Migração de Dados para Novo Modelo ---');

  // 1. Atualizar Categorias (Natureza e Comportamento)
  const { data: categories } = await supabase.from('categories').select('id, name, default_type, expense_behavior');
  
  for (const cat of categories || []) {
    let nature = cat.default_type;
    let behavior = null;

    if (FAMILIES.fixed.some(f => cat.name.includes(f))) {
      nature = 'despesa';
      behavior = 'fixed';
    } else if (FAMILIES.variable.some(f => cat.name.includes(f))) {
      nature = 'despesa';
      behavior = 'variable';
    }

    if (nature !== cat.default_type || behavior !== cat.expense_behavior) {
      await supabase.from('categories').update({ default_type: nature, expense_behavior: behavior }).eq('id', cat.id);
    }
  }

  // 2. Atualizar Receipts do Período Jan-Abr
  let allRows: any[] = [];
  let page = 0;
  while(true) {
    const { data } = await supabase
      .from('receipts')
      .select('id, amount, transaction_type, expense_behavior, payment_date, recipient_name, description, category:categories!receipts_category_id_fkey(name, default_type, expense_behavior)')
      .eq('profile_id', PROFILE_ID)
      .gte('payment_date', START_DATE)
      .lte('payment_date', END_DATE)
      .range(page*1000, (page+1)*1000 - 1);
    if (!data || data.length === 0) break;
    allRows = allRows.concat(data);
    page++;
  }

  for (const row of allRows) {
    const cat = row.category as any;
    let nature = row.transaction_type;
    let behavior = row.expense_behavior;

    // Se o tipo atual for 'gasto_fixo' ou 'gasto_variavel', normalizar para 'despesa'
    if (nature === 'gasto_fixo') { nature = 'despesa'; behavior = 'fixed'; }
    if (nature === 'gasto_variavel') { nature = 'despesa'; behavior = 'variable'; }

    // Herdando da categoria se for despesa
    if (nature === 'despesa' && cat) {
      behavior = cat.expense_behavior || behavior;
    }
    
    // Se for investimento, behavior deve ser null
    if (nature === 'investimento') behavior = null;

    if (nature !== row.transaction_type || behavior !== row.expense_behavior) {
      await supabase.from('receipts').update({ transaction_type: nature, expense_behavior: behavior }).eq('id', row.id);
      row.transaction_type = nature;
      row.expense_behavior = behavior;
    }
  }

  // 3. Cálculos e Reconciliação
  const stats: any = {};
  allRows.forEach(r => {
    const m = r.payment_date.substring(0, 7);
    if (!stats[m]) stats[m] = { expense: 0, investment: 0, fixed: 0, variable: 0 };
    const v = Math.round(Number(r.amount) * 100);
    
    if (r.transaction_type === 'despesa') stats[m].expense += v;
    if (r.transaction_type === 'investimento') stats[m].investment += v;
    if (r.expense_behavior === 'fixed') stats[m].fixed += v;
    if (r.expense_behavior === 'variable') stats[m].variable += v;
  });

  console.log('\n--- TOTAIS JAN-ABR APÓS CORREÇÃO ---');
  const monthKeys = ['2026-01', '2026-02', '2026-03', '2026-04'];
  const map: any = { '2026-01': 'jan', '2026-02': 'feb', '2026-03': 'mar', '2026-04': 'apr' };
  
  monthKeys.forEach(mk => {
    const s = stats[mk] || { expense: 0, investment: 0, fixed: 0, variable: 0 };
    const o = (OFFICIAL_REPORT as any)[map[mk]];
    console.log(`\n${mk}:`);
    console.log(`  Despesa: R$ ${(s.expense/100).toLocaleString('pt-BR')} (Relatório: R$ ${(o.expense/100).toLocaleString('pt-BR')})`);
    console.log(`  Invest: R$ ${(s.investment/100).toLocaleString('pt-BR')} (Relatório: R$ ${(o.investment/100).toLocaleString('pt-BR')})`);
    console.log(`  Fixo: R$ ${(s.fixed/100).toLocaleString('pt-BR')} (Relatório: R$ ${(o.fixed/100).toLocaleString('pt-BR')})`);
    console.log(`  Variável: R$ ${(s.variable/100).toLocaleString('pt-BR')} (Relatório: R$ ${(o.variable/100).toLocaleString('pt-BR')})`);
  });

  // Divergências
  console.log('\n--- DIVERGÊNCIAS RESTANTES (Top 5 Desvios Fixo/Variável) ---');
  const topDeviations = allRows
    .filter(r => r.expense_behavior === 'fixed' || r.expense_behavior === 'variable')
    .sort((a,b) => b.amount - a.amount)
    .slice(0, 5);
  topDeviations.forEach(d => console.log(`- ${d.payment_date} | ${d.recipient_name} | R$ ${Number(d.amount).toFixed(2)} | Natureza: ${d.transaction_type} | Tipo: ${d.expense_behavior}`));
}

run();
