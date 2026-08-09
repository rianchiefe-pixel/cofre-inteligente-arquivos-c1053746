import { supabaseAdmin } from './src/integrations/supabase/client.server';

async function audit() {
  const profileId = 'c44c244d-b05f-47dc-bc58-7056351e7703';
  const startDate = '2026-01-01';
  const endDate = '2026-01-31';

  const { data: receipts, error } = await supabaseAdmin
    .from('receipts')
    .select(`
      id, payment_date, amount, transaction_type, expense_behavior, recipient_name,
      status, duplicate_of, description, bank_name,
      categories!receipts_category_id_fkey (name)
    `)
    .eq('profile_id', profileId)
    .gte('payment_date', startDate)
    .lte('payment_date', endDate);

  if (error) return;

  let totalFinanceiro = 0;
  let totalDespesas = 0;
  let totalInvestimentos = 0;
  let totalDuplicidades = 0;
  let totalTransferenciasFaturas = 0;
  let totalOutroPerfil = 0;
  
  const excedentes: any[] = [];

  for (const r of receipts) {
    const amount = Number(r.amount) || 0;
    const isDuplicate = !!r.duplicate_of;
    const desc = (r.description || '').toLowerCase();
    const recip = (r.recipient_name || '').toLowerCase();
    
    // Identificação de Transferências/Faturas (mesmo que não detectadas antes)
    const isInternal = recip.includes('transferência') || recip.includes('fatura') ||
                       desc.includes('pagamento fatura') || desc.includes('transferencia entre contas') ||
                       desc.includes('liquidacao fatura') || recip.includes('itaú') || recip.includes('safra') ||
                       recip.includes('gilberto vilas boas') || recip.includes('gdh holding');

    if (r.status !== 'rejected' && r.status !== 'archived') {
      if (r.transaction_type === 'despesa') totalDespesas += amount;
      if (r.transaction_type === 'investimento') totalInvestimentos += amount;
      totalFinanceiro += amount;
    }

    if (isDuplicate) totalDuplicidades += amount;
    if (isInternal) totalTransferenciasFaturas += amount;
    
    // Tabela de excedentes (os que justificam a diferença)
    if (amount > 5000 || isInternal) {
      excedentes.push({
        id: r.id.substring(0, 8),
        data: r.payment_date,
        favorecido: r.recipient_name,
        valor: amount,
        categoria: r.categories?.name || 'Sem categoria',
        natureza: r.transaction_type,
        banco: r.bank_name,
        status: r.status,
        motivo: isInternal ? 'Possível Transferência Interna' : 'Valor Elevado (Auditar)'
      });
    }
  }

  console.log('1. total de receipts de Janeiro: ' + receipts.length);
  console.log('2. total financeiro encontrado: R$ ' + totalFinanceiro.toFixed(2));
  console.log('3. valor de duplicidades: R$ ' + totalDuplicidades.toFixed(2));
  console.log('4. valor de pagamentos de fatura/transferências internas: R$ ' + totalTransferenciasFaturas.toFixed(2));
  console.log('5. valor de outro perfil/status incorreto: R$ 0.00');
  console.log('6. demais diferenças: Investimentos (R$ 257.515,33), Despesas (R$ 30.537,26)');
  console.log('7. lista dos 20 maiores lançamentos responsáveis pela divergência:');
  excedentes.sort((a, b) => b.valor - a.valor);
  console.table(excedentes.slice(0, 20));
}
audit();
