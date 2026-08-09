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

async function run() {
  console.log('--- Iniciando Revisão de Classificação ---');

  // 1. Buscar todos os receipts do período Jan-Abr para o perfil
  const { data: receipts, error: fetchError } = await supabase
    .from('receipts')
    .select(`
      id,
      date,
      amount_cents,
      payee,
      description,
      transaction_type,
      category:categories(id, name, default_type)
    `)
    .eq('profile_id', PROFILE_ID)
    .gte('date', START_DATE)
    .lte('date', END_DATE);

  if (fetchError || !receipts) {
    console.error('Erro ao buscar lançamentos:', fetchError);
    return;
  }

  let revisedCount = 0;
  let maintainedCount = 0;
  let revertedCount = 0;
  let manualReviewCount = 0;

  for (const row of receipts) {
    const categoryName = (row.category as any)?.name || '';
    const payee = (row.payee || '').toLowerCase();
    const description = (row.description || '').toLowerCase();
    const currentType = row.transaction_type;

    let targetType = currentType;
    let shouldUpdate = false;

    // LÓGICA DE REVERSÃO / REVISÃO
    // Se foi generalizado como "Saúde" -> Gasto Variável na vez passada, mas não é farmácia/pediatra
    if (categoryName.startsWith('Saúde') && currentType === 'variable') {
      const isFarmacia = payee.includes('farmacia') || payee.includes('drogaria') || description.includes('farmacia');
      const isPediatra = payee.includes('pediatra') || description.includes('pediatra');

      if (!isFarmacia && !isPediatra) {
        // Reverter ou mandar para revisão
        // No Meu Cofre, o default para saúde genérico se não for farmácia/pediatra e não for plano (fixed) costuma ser manual ou nulo
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
      revisedCount++;
    }
  }

  // 2. Recalcular Totais
  const { data: finalReceipts } = await supabase
    .from('receipts')
    .select('amount_cents, transaction_type, date')
    .eq('profile_id', PROFILE_ID)
    .gte('date', START_DATE)
    .lte('date', END_DATE);

  const totals = {
    fixed: 0,
    variable: 0,
    byMonth: {} as any
  };

  finalReceipts?.forEach(r => {
    const month = r.date.substring(0, 7); // YYYY-MM
    if (!totals.byMonth[month]) totals.byMonth[month] = { fixed: 0, variable: 0 };

    if (r.transaction_type === 'fixed') {
      totals.fixed += r.amount_cents;
      totals.byMonth[month].fixed += r.amount_cents;
    } else if (r.transaction_type === 'variable') {
      totals.variable += r.amount_cents;
      totals.byMonth[month].variable += r.amount_cents;
    }
  });

  console.log('\n--- RESULTADOS ---');
  console.log(`1. Receipts revisados: ${receipts.length}`);
  console.log(`2. Alterações mantidas: ${maintainedCount}`);
  console.log(`3. Alterações revertidas: ${revertedCount}`);
  console.log(`4. Lançamentos enviados para revisão: ${manualReviewCount}`);
  console.log(`5. Total Fixo Jan-Abr: R$ ${(totals.fixed / 100).toLocaleString('pt-BR')}`);
  console.log(`6. Total Variável Jan-Abr: R$ ${(totals.variable / 100).toLocaleString('pt-BR')}`);
  
  const diffFixed = totals.fixed - OFFICIAL_REPORT.total.fixed;
  const diffVar = totals.variable - OFFICIAL_REPORT.total.variable;

  console.log(`7. Diferença exata contra o relatório: Fixo R$ ${(diffFixed/100).toFixed(2)}, Variável R$ ${(diffVar/100).toFixed(2)}`);

  // 8. Identificar os "vilões" da diferença (maiores lançamentos que não estão batendo)
  // Como não temos o Excel transacional aqui, listamos os maiores para inspeção manual
  console.log('\n8. Principais lançamentos no banco (Top 5 por valor):');
  const top = receipts.sort((a, b) => b.amount_cents - a.amount_cents).slice(0, 5);
  top.forEach(t => console.log(`- ${t.date} | ${t.payee} | R$ ${(t.amount_cents/100).toFixed(2)} | ${t.transaction_type}`));
}

run();
