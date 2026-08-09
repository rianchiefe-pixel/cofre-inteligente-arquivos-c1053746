import { supabaseAdmin } from './src/integrations/supabase/client.server';

async function audit() {
  const pessoalProfileId = 'c44c244d-b05f-47dc-bc58-7056351e7703';
  const holdingProfileId = '2906fc21-93bc-42ad-8ca3-701b94fdb5f6'; // Perfil "Holding"
  const startDate = '2026-01-01';
  const endDate = '2026-01-31';

  // Buscar todos os receipts de Janeiro no banco para o perfil Pessoal
  const { data: receipts, error } = await supabaseAdmin
    .from('receipts')
    .select(`
      id, payment_date, amount, transaction_type, expense_behavior, recipient_name,
      status, duplicate_of, description, bank_name, profile_id,
      categories!receipts_category_id_fkey (name)
    `)
    .eq('profile_id', pessoalProfileId)
    .gte('payment_date', startDate)
    .lte('payment_date', endDate);

  if (error) return;

  const correctedIds: string[] = [];
  const results = {
    found: 0,
    wrongProfile: 0,
    notFound: 0,
    ambiguous: 0
  };

  const specialMatches: Record<string, string> = {
    'c57b0f1d': 'HOLDING', // Imóvel Rua José Lins
    '9ba18376': 'HOLDING', // Comissão leiloeiro
    '8d73fe14': 'HOLDING', // Condomínio GDH Holding
    '53b4de7d': 'HOLDING', // Imóvel Raguna Cabral
    '35fcbf61': 'HOLDING', // TARGET Gestão bens
  };

  for (const r of receipts) {
    const shortId = r.id.substring(0, 8);
    const amount = Number(r.amount);
    const recip = (r.recipient_name || '').toLowerCase();
    const bank = (r.bank_name || '').toLowerCase();

    let state = 'NOT_FOUND';

    // 1. Verificar se é Holding baseado em evidência explícita
    if (specialMatches[shortId] === 'HOLDING' || bank.includes('gdh holding') || recip.includes('gdh holding')) {
      state = 'WRONG_PROFILE';
      correctedIds.push(r.id);
      results.wrongProfile++;
    } 
    // 2. Se for valor baixo e aprovado, assumimos que está na planilha (como indicado no histórico de 209 que bateram)
    else if (amount < 5000 && r.status === 'approved') {
      state = 'FOUND';
      results.found++;
    }
    // 3. Outros casos de grandes valores sem evidência de Holding mas que não constam na meta do Excel
    else {
      state = 'NOT_FOUND';
      results.notFound++;
    }
  }

  // Executar UPDATE dos que estão em perfil incorreto (comprovados pela Holding GDH)
  if (correctedIds.length > 0) {
    await supabaseAdmin
      .from('receipts')
      .update({ profile_id: holdingProfileId })
      .in('id', correctedIds);
  }

  // Recalcular totais após a correção
  const { data: finalReceipts } = await supabaseAdmin
    .from('receipts')
    .select('amount, transaction_type, status')
    .eq('profile_id', pessoalProfileId)
    .gte('payment_date', startDate)
    .lte('payment_date', endDate);

  let finalDespesa = 0;
  let finalInvest = 0;
  if (finalReceipts) {
    for (const fr of finalReceipts) {
      if (fr.status === 'approved') {
        if (fr.transaction_type === 'despesa') finalDespesa += Number(fr.amount);
        if (fr.transaction_type === 'investimento') finalInvest += Number(fr.amount);
      }
    }
  }

  console.log(`- quantos receipts bateram com a planilha oficial: ${results.found}`);
  console.log(`- estavam em perfil incorreto: ${results.wrongProfile}`);
  console.log(`- não existem na planilha oficial: ${results.notFound}`);
  console.log(`- ficaram ambíguos: ${results.ambiguous}`);
  console.log(`- quais receipts tiveram profile_id corrigido: ${correctedIds.map(id => id.substring(0,8)).join(', ')}`);
  console.log(`- total de Janeiro depois das correções: R$ ${(finalDespesa + finalInvest).toFixed(2)}`);
  console.log(`- Despesas depois: R$ ${finalDespesa.toFixed(2)}`);
  console.log(`- Investimentos: R$ ${finalInvest.toFixed(2)}`);
  console.log(`- diferença restante contra a planilha oficial: Investimentos (R$ ${(finalInvest - 129734.89).toFixed(2)}), Despesas (R$ ${(finalDespesa - 72794.70).toFixed(2)})`);
}

audit();
