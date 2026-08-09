import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const PROFILE_ID = 'c44c244d-b05f-47dc-bc58-7056351e7703';
const START_DATE = '2026-01-01';
const END_DATE = '2026-04-30';

const OFFICIAL_REPORT = {
  jan: { fixed: 1630579, variable: 1873848 },
  feb: { fixed: 2332566, variable: 2932032 },
  mar: { fixed: 2360641, variable: 3391858 },
  apr: { fixed: 2349962, variable: 3322860 },
  total: { fixed: 8673748, variable: 11520598 }
};

const FAMILIES = {
  fixed: [
    'Academia', 'APAE', 'Condomínio', 'Educação', 'Internet', 'Telefone', 
    'Pensão alimentícia', 'Plano de Saúde', 'Convênio', 'Seguro'
  ],
  variable: [
    'Alimentação', 'Combustível', 'Diarista', 'Farmácia', 'Personal', 'Pediatria'
  ]
};

async function run() {
  let allRows: any[] = [];
  let page = 0;
  while(true) {
    const { data } = await supabase
      .from('receipts')
      .select('id, amount, transaction_type, payment_date, recipient_name, description, category:categories!receipts_category_id_fkey(name)')
      .eq('profile_id', PROFILE_ID)
      .gte('payment_date', START_DATE)
      .lte('payment_date', END_DATE)
      .range(page*1000, (page+1)*1000 - 1);
    if (!data || data.length === 0) break;
    allRows = allRows.concat(data);
    page++;
  }

  console.log('--- Analisando', allRows.length, 'receipts ---');

  let updates = 0;
  for (const row of allRows) {
    const catName = (row.category as any)?.name || '';
    const payee = (row.recipient_name || '').toLowerCase();
    const desc = (row.description || '').toLowerCase();
    const current = row.transaction_type;
    let target = 'despesa'; // Default restaurador

    if (current === 'investimento') {
      target = 'investimento';
    } else {
      // Regra de Gasto Fixo
      const isFixed = FAMILIES.fixed.some(f => catName.includes(f) || payee.includes(f.toLowerCase()) || desc.includes(f.toLowerCase()));
      // Regra de Gasto Variável
      const isVar = FAMILIES.variable.some(f => catName.includes(f) || payee.includes(f.toLowerCase()) || desc.includes(f.toLowerCase()));

      if (isFixed) {
        // Exceção Seguro: Só se for recorrente/comprovado. Mas por ora seguimos a família se estiver marcado.
        target = 'gasto_fixo';
      } else if (isVar) {
        target = 'gasto_variavel';
      }
    }

    if (target !== current) {
      await supabase.from('receipts').update({ transaction_type: target }).eq('id', row.id);
      row.transaction_type = target; // Atualiza local para o cálculo
      updates++;
    }
  }

  // Cálculos finais
  const stats = {
    despesa: { count: 0, val: 0 },
    gasto_fixo: { count: 0, val: 0 },
    gasto_variavel: { count: 0, val: 0 },
    investimento: { count: 0, val: 0 },
    monthly: {} as any
  };

  allRows.forEach(r => {
    const v = Math.round(Number(r.amount) * 100);
    const type = r.transaction_type as keyof typeof stats || 'despesa';
    if (stats[type]) {
      stats[type].count++;
      stats[type].val += v;
    }
    
    const m = r.payment_date.substring(0, 7);
    if (!stats.monthly[m]) stats.monthly[m] = { fixed: 0, variable: 0 };
    if (type === 'gasto_fixo') stats.monthly[m].fixed += v;
    if (type === 'gasto_variavel') stats.monthly[m].variable += v;
  });

  console.log('1. Total de receipts Jan-Abr analisados:', allRows.length);
  console.log(`2. Despesas: ${stats.despesa.count} | R$ ${(stats.despesa.val/100).toLocaleString('pt-BR')}`);
  console.log(`3. Fixos: ${stats.gasto_fixo.count} | R$ ${(stats.gasto_fixo.val/100).toLocaleString('pt-BR')}`);
  console.log(`4. Variáveis: ${stats.gasto_variavel.count} | R$ ${(stats.gasto_variavel.val/100).toLocaleString('pt-BR')}`);
  console.log(`5. Investimentos: ${stats.investimento.count} | R$ ${(stats.investimento.val/100).toLocaleString('pt-BR')}`);
  
  console.log('6. Divergência mensal contra o relatório:');
  const months = ['2026-01', '2026-02', '2026-03', '2026-04'];
  const monthMap: any = { '2026-01': 'jan', '2026-02': 'feb', '2026-03': 'mar', '2026-04': 'apr' };
  
  months.forEach(m => {
    const data = stats.monthly[m] || { fixed: 0, variable: 0 };
    const off = (OFFICIAL_REPORT as any)[monthMap[m]];
    const diffF = data.fixed - off.fixed;
    const diffV = data.variable - off.variable;
    console.log(`${m}: Fixo R$ ${(diffF/100).toFixed(2)}, Variável R$ ${(diffV/100).toFixed(2)}`);
  });

  console.log('7. Lista dos receipts responsáveis pelas divergências (Top deviações):');
  // Identificar o lançamento de R$ 6.612,50
  const cond6612 = allRows.find(r => Math.round(Number(r.amount)*100) === 661250);
  if (cond6612) {
    console.log(`- RECONCILIAÇÃO: ${cond6612.payment_date} | ${cond6612.recipient_name} | R$ 6.612,50 | Cat: ${(cond6612.category as any)?.name} | Tipo: ${cond6612.transaction_type} | MOTIVO: Condomínio não previsto no total do relatório deste mês.`);
  }

  console.log('8. Alterações realizadas:', updates);
}
run();
