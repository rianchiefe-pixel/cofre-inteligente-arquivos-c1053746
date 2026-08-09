import { supabaseAdmin } from './src/integrations/supabase/client.server';

async function audit() {
  const profileId = 'c44c244d-b05f-47dc-bc58-7056351e7703';
  const startDate = '2026-01-01';
  const endDate = '2026-01-31';

  // Buscar todos os receipts de Janeiro para o perfil
  const { data: receipts, error } = await supabaseAdmin
    .from('receipts')
    .select(`
      id,
      payment_date,
      amount,
      transaction_type,
      expense_behavior,
      recipient_name,
      status,
      duplicate_of,
      description,
      import_row_id,
      bank_name,
      categories!receipts_category_id_fkey (name)
    `)
    .eq('profile_id', profileId)
    .gte('payment_date', startDate)
    .lte('payment_date', endDate);

  if (error) {
    console.error('Erro ao buscar receipts:', error);
    return;
  }

  let totalFinanceiro = 0;
  let totalDespesas = 0;
  let totalInvestimentos = 0;
  let totalDuplicidades = 0;
  let totalTransferenciasFaturas = 0;
  let totalArquivadosRejeitados = 0;
  
  const excedentes: any[] = [];

  for (const r of receipts) {
    const amount = Number(r.amount) || 0;
    
    // Contabilização para comparação com "Banco Atual"
    if (r.status !== 'rejected' && r.status !== 'archived') {
      if (r.transaction_type === 'despesa') totalDespesas += amount;
      if (r.transaction_type === 'investimento') totalInvestimentos += amount;
      totalFinanceiro += amount;
    }

    const isDuplicate = !!r.duplicate_of;
    const desc = (r.description || '').toLowerCase();
    const recip = (r.recipient_name || '').toLowerCase();
    const isInternal = recip.includes('transferência') || 
                       recip.includes('fatura') ||
                       desc.includes('pagamento fatura') ||
                       desc.includes('transferencia entre contas') ||
                       desc.includes('liquidacao fatura');
    const isNotActive = r.status === 'rejected' || r.status === 'archived';

    if (isDuplicate) totalDuplicidades += amount;
    if (isInternal) totalTransferenciasFaturas += amount;
    if (isNotActive) totalArquivadosRejeitados += amount;

    // Critério para auditoria detalhada
    if (isDuplicate || isInternal || isNotActive || amount > 5000) {
      excedentes.push({
        id: r.id.substring(0, 8),
        data: r.payment_date,
        favorecido: r.recipient_name,
        valor: amount,
        categoria: r.categories?.name || 'Sem categoria',
        natureza: r.transaction_type,
        banco: r.bank_name,
        status: r.status,
        motivo: isDuplicate ? 'Duplicata' : (isInternal ? 'Transf/Fatura' : (isNotActive ? 'Arquivado/Rejeitado' : 'Valor Elevado'))
      });
    }
  }

  console.log('\n--- Auditoria Janeiro 2026 ---');
  console.log(`1. Total de receipts de Janeiro: ${receipts.length}`);
  console.log(`2. Total financeiro encontrado: R$ ${totalFinanceiro.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
  console.log(`   - Despesas: R$ ${totalDespesas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
  console.log(`   - Investimentos: R$ ${totalInvestimentos.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
  console.log(`3. Valor de duplicidades: R$ ${totalDuplicidades.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
  console.log(`4. Valor de pagamentos de fatura/transferências internas: R$ ${totalTransferenciasFaturas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
  console.log(`5. Valor de outro perfil/status incorreto (Arquivados/Rejeitados): R$ ${totalArquivadosRejeitados.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
  
  const diffInvest = totalInvestimentos - 129734.89;
  const diffDesp = totalDespesas - 72794.70;
  console.log(`6. Demais diferenças:`);
  console.log(`   - Diferença Investimentos: R$ ${diffInvest.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
  console.log(`   - Diferença Despesas: R$ ${diffDesp.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);

  console.log('\n7. Lista dos 20 maiores lançamentos responsáveis pela divergência:');
  excedentes.sort((a, b) => b.valor - a.valor);
  console.table(excedentes.slice(0, 20));
}

audit();
