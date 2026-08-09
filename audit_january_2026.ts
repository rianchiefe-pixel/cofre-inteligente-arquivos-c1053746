import { supabaseAdmin } from './src/integrations/supabase/client.server';

async function audit() {
  const profileId = 'c44c244d-b05f-47dc-bc58-7056351e7703';
  const startDate = '2026-01-01';
  const endDate = '2026-01-31';

  // 1. Buscar todos os receipts de Janeiro para o perfil
  const { data: receipts, error } = await supabaseAdmin
    .from('receipts')
    .select(`
      id,
      payment_date,
      purchase_date,
      amount,
      transaction_type,
      expense_behavior,
      beneficiary,
      status,
      duplicate_of,
      description,
      source_file_id,
      bank_account,
      categories (name)
    `)
    .eq('profile_id', profileId)
    .gte('payment_date', startDate)
    .lte('payment_date', endDate);

  if (error) {
    console.error('Erro ao buscar receipts:', error);
    return;
  }

  console.log(`Total de receipts encontrados para Janeiro/2026: ${receipts.length}`);

  let totalFinanceiro = 0;
  let totalDespesas = 0;
  let totalInvestimentos = 0;
  let totalDuplicidades = 0;
  let totalTransferenciasFaturas = 0;
  let totalArquivadosRejeitados = 0;
  
  const excedentes: any[] = [];

  for (const r of receipts) {
    const amount = Number(r.amount) || 0;
    
    // Contabilização básica para comparação com o "Banco Atual" do usuário
    if (r.status !== 'rejected' && r.status !== 'archived') {
      if (r.transaction_type === 'despesa') totalDespesas += amount;
      if (r.transaction_type === 'investimento') totalInvestimentos += amount;
      totalFinanceiro += amount;
    }

    // Identificação de possíveis problemas
    const isDuplicate = !!r.duplicate_of;
    const isInternal = r.beneficiary?.toLowerCase().includes('transferência') || 
                       r.beneficiary?.toLowerCase().includes('fatura') ||
                       r.description?.toLowerCase().includes('pagamento fatura');
    const isNotActive = r.status === 'rejected' || r.status === 'archived';

    if (isDuplicate) totalDuplicidades += amount;
    if (isInternal) totalTransferenciasFaturas += amount;
    if (isNotActive) totalArquivadosRejeitados += amount;

    // Critério de "Excedente": 
    // - Lançamentos grandes que podem não estar no relatório
    // - Transferências que deveriam ser ignoradas
    // - Duplicatas
    if (isDuplicate || isInternal || isNotActive || amount > 5000) {
      excedentes.push({
        id: r.id,
        data: r.payment_date,
        favorecido: r.beneficiary,
        valor: amount,
        categoria: r.categories?.name,
        natureza: r.transaction_type,
        banco: r.bank_account,
        status: r.status,
        motivo: isDuplicate ? 'Duplicata' : (isInternal ? 'Transf/Fatura' : (isNotActive ? 'Arquivado/Rejeitado' : 'Valor Elevado'))
      });
    }
  }

  console.log('\n--- Auditoria Janeiro 2026 ---');
  console.log(`1. Total de receipts: ${receipts.length}`);
  console.log(`2. Total financeiro ativo encontrado: R$ ${totalFinanceiro.toFixed(2)}`);
  console.log(`   - Despesas: R$ ${totalDespesas.toFixed(2)}`);
  console.log(`   - Investimentos: R$ ${totalInvestimentos.toFixed(2)}`);
  console.log(`3. Valor de duplicidades: R$ ${totalDuplicidades.toFixed(2)}`);
  console.log(`4. Valor de pagamentos de fatura/transferências internas: R$ ${totalTransferenciasFaturas.toFixed(2)}`);
  console.log(`5. Valor de registros arquivados/rejeitados: R$ ${totalArquivadosRejeitados.toFixed(2)}`);
  
  const diffInvest = totalInvestimentos - 129734.89;
  const diffDesp = totalDespesas - 72794.70;
  console.log(`\n6. Diferença Investimentos vs Relatório: R$ ${diffInvest.toFixed(2)}`);
  console.log(`   Diferença Despesas vs Relatório: R$ ${diffDesp.toFixed(2)}`);

  console.log('\n7. Top 20 maiores lançamentos responsáveis pela divergência (ou excedentes):');
  excedentes.sort((a, b) => b.valor - a.valor);
  console.table(excedentes.slice(0, 20));
}

audit();
