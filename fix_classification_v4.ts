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
  console.log('--- Re-analisando Jan-Abr no Modelo de Dois Eixos ---');

  // 1. Garantir Categorias (Recalcular do Relatório)
  const { data: categories } = await supabase.from('categories').select('id, name, default_type, expense_behavior');
  const catMap = new Map();
  for (const cat of categories || []) {
    let nature = 'despesa'; // Default
    let behavior = null;
    
    if (cat.default_type === 'investimento') nature = 'investimento';
    
    if (FAMILIES.fixed.some(f => cat.name.includes(f))) behavior = 'fixed';
    else if (FAMILIES.variable.some(f => cat.name.includes(f))) behavior = 'variable';

    if (nature !== cat.default_type || behavior !== cat.expense_behavior) {
      await supabase.from('categories').update({ default_type: nature, expense_behavior: behavior }).eq('id', cat.id);
    }
    catMap.set(cat.id, { nature, behavior });
  }

  // 2. Receipts
  let allRows: any[] = [];
  let page = 0;
  while(true) {
    const { data } = await supabase
      .from('receipts')
      .select('id, amount, transaction_type, expense_behavior, payment_date, recipient_name, category_id')
      .eq('profile_id', PROFILE_ID)
      .gte('payment_date', START_DATE)
      .lte('payment_date', END_DATE)
      .range(page*1000, (page+1)*1000 - 1);
    if (!data || data.length === 0) break;
    allRows = allRows.concat(data);
    page++;
  }

  for (const row of allRows) {
    let nature = row.transaction_type;
    let behavior = row.expense_behavior;
    const cat = row.category_id ? catMap.get(row.category_id) : null;

    // Normalização: se era gasto_fixo/gasto_variavel, vira despesa + behavior
    if (nature === 'gasto_fixo') { nature = 'despesa'; behavior = 'fixed'; }
    else if (nature === 'gasto_variavel') { nature = 'despesa'; behavior = 'variable'; }
    else if (nature === 'despesa' || !nature) {
      nature = 'despesa';
      if (cat) behavior = cat.behavior;
    }

    if (nature !== row.transaction_type || behavior !== row.expense_behavior) {
      await supabase.from('receipts').update({ transaction_type: nature, expense_behavior: behavior }).eq('id', row.id);
      row.transaction_type = nature;
      row.expense_behavior = behavior;
    }
  }

  // Cálculos
  const stats: any = {};
  allRows.forEach(r => {
    const m = r.payment_date.substring(0, 7);
    if (!stats[m]) stats[m] = { expense: 0, investment: 0, fixed: 0, variable: 0 };
    const v = Math.round(Number(r.amount) * 100);
    
    if (r.transaction_type === 'despesa') stats[m].expense += v;
    if (r.transaction_type === 'investimento') stats[m].investment += v;
    if (r.transaction_type === 'despesa' && r.expense_behavior === 'fixed') stats[m].fixed += v;
    if (r.transaction_type === 'despesa' && r.expense_behavior === 'variable') stats[m].variable += v;
  });

  const months = ['2026-01', '2026-02', '2026-03', '2026-04'];
  const monthMap: any = { '2026-01': 'jan', '2026-02': 'feb', '2026-03': 'mar', '2026-04': 'apr' };
  
  months.forEach(m => {
    const s = stats[m] || { expense: 0, investment: 0, fixed: 0, variable: 0 };
    const o = (OFFICIAL_REPORT as any)[monthMap[m]];
    console.log(`\n${m}:`);
    console.log(`  Despesa: R$ ${(s.expense/100).toLocaleString('pt-BR')} (Relatório: R$ ${(o.expense/100).toLocaleString('pt-BR')}) | Diff: R$ ${((s.expense - o.expense)/100).toFixed(2)}`);
    console.log(`  Invest: R$ ${(s.investment/100).toLocaleString('pt-BR')} (Relatório: R$ ${(o.investment/100).toLocaleString('pt-BR')}) | Diff: R$ ${((s.investment - o.investment)/100).toFixed(2)}`);
    console.log(`  Fixo: R$ ${(s.fixed/100).toLocaleString('pt-BR')} (Relatório: R$ ${(o.fixed/100).toLocaleString('pt-BR')}) | Diff: R$ ${((s.fixed - o.fixed)/100).toFixed(2)}`);
    console.log(`  Variável: R$ ${(s.variable/100).toLocaleString('pt-BR')} (Relatório: R$ ${(o.variable/100).toLocaleString('pt-BR')}) | Diff: R$ ${((s.variable - o.variable)/100).toFixed(2)}`);
  });
}
run();
