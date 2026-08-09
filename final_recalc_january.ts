import { supabaseAdmin } from './src/integrations/supabase/client.server';

async function audit() {
  const pessoalProfileId = 'c44c244d-b05f-47dc-bc58-7056351e7703';
  const holdingProfileId = '2906fc21-93bc-42ad-8ca3-701b94fdb5f6';
  const startDate = '2026-01-01';
  const endDate = '2026-01-31';

  // Buscar os 4 que sobraram
  const remainingIds = [
    '4dca5f07-9cff-42bc-95ac-fc979a2e57a2', // IPVA TAOS
    '717fca85-4bc8-4083-a1ab-8aae302b2bd0', // OPERADOR NACIONAL
    '8cff404a-f2bd-4489-811d-e232665506f7', // FORNECEDOR DE GADO
    '309d25b6-0071-4377-8772-c26790058206'  // JOSIAS GONGALVES Marceneiro
  ];

  // Reverter 3 investimentos para Pessoal se eles explicarem os R$ 129k
  // Recalculando Jan sem os 6 que movi
  const { data: finalReceipts } = await supabaseAdmin
    .from('receipts')
    .select('id, amount, transaction_type, status, recipient_name')
    .eq('profile_id', pessoalProfileId)
    .gte('payment_date', startDate)
    .lte('payment_date', endDate)
    .eq('status', 'approved');

  let totalDesp = 0;
  let totalInv = 0;
  finalReceipts?.forEach(r => {
    const val = Number(r.amount);
    if (r.transaction_type === 'despesa') totalDesp += val;
    else totalInv += val;
  });

  console.log(`NOVO TOTAL JANEIRO:`);
  console.log(`Despesas: R$ ${totalDesp.toFixed(2)} (Diferença: R$ ${(totalDesp - 72794.70).toFixed(2)})`);
  console.log(`Investimentos: R$ ${totalInv.toFixed(2)} (Diferença: R$ ${(totalInv - 129734.89).toFixed(2)})`);
}
audit();
