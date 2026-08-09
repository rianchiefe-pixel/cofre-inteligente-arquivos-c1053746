import { supabaseAdmin } from './src/integrations/supabase/client.server';

async function audit() {
  const pessoalProfileId = 'c44c244d-b05f-47dc-bc58-7056351e7703';
  const holdingProfileId = '2906fc21-93bc-42ad-8ca3-701b94fdb5f6';
  const startDate = '2026-01-01';
  const endDate = '2026-01-31';

  // 1. Identificar os 10 "Não encontrados"
  // Já sabemos que:
  // 212 bateram (valor < 5000 e aprovado)
  // 17 foram corrigidos para Holding (GDH no nome/banco)
  // Total eram 239. 239 - 212 - 17 = 10.

  const { data: receipts, error } = await supabaseAdmin
    .from('receipts')
    .select(`
      id, payment_date, amount, transaction_type, expense_behavior, recipient_name,
      status, duplicate_of, description, bank_name, profile_id, created_at,
      import_row_id,
      categories!receipts_category_id_fkey (name)
    `)
    .eq('profile_id', pessoalProfileId)
    .gte('payment_date', startDate)
    .lte('payment_date', endDate);

  if (error) return;

  const notFoundReceipts = receipts.filter(r => {
    const amount = Number(r.amount);
    const recip = (r.recipient_name || '').toLowerCase();
    const bank = (r.bank_name || '').toLowerCase();
    const isHolding = bank.includes('gdh holding') || recip.includes('gdh holding');
    
    // Os que restaram são os que não bateram no critério < 5000 e não são Holding óbvia
    return !isHolding && (amount >= 5000 || r.status !== 'approved');
  });

  console.log('--- AUDITORIA DOS 10 RECEIPTS ---');
  
  const resultsTable: any[] = [];
  let sumInvest = 0;
  let sumDespesa = 0;

  for (const r of notFoundReceipts) {
    const amount = Number(r.amount);
    if (r.transaction_type === 'investimento') sumInvest += amount;
    else sumDespesa += amount;

    resultsTable.push({
      id: r.id,
      data: r.payment_date,
      favorecido: r.recipient_name,
      desc: r.description,
      valor: amount,
      cat: r.categories?.name,
      tipo: r.transaction_type,
      behavior: r.expense_behavior,
      banco: r.bank_name,
      status: r.status,
      created: r.created_at
    });
  }

  console.table(resultsTable);
  console.log(`Soma Despesas dos 10: R$ ${sumDespesa.toFixed(2)}`);
  console.log(`Soma Investimentos dos 10: R$ ${sumInvest.toFixed(2)}`);

  // Análise de classificação baseada nos dados impressos
  // (Vou rodar primeiro para ver a tabela e depois decidir os UPDATES no mesmo script ou próximo)
}

audit();
