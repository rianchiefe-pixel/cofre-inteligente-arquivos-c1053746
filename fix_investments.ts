import { supabaseAdmin } from './src/integrations/supabase/client.server';

async function audit() {
  const pessoalProfileId = 'c44c244d-b05f-47dc-bc58-7056351e7703';
  const holdingProfileId = '2906fc21-93bc-42ad-8ca3-701b94fdb5f6';

  // Lançamentos da Holding que parecem pertencer ao Pessoal para somar os R$ 129k
  // (Leandro Tedros R$ 54k + José Batista R$ 20k + Novi Pisos R$ 5.5k + etc)
  const revertToPessoal = [
    '09fab1e4-45ec-4f04-ac0e-d94a224c0576', // LEANDRO C TEDROS (R$ 54k)
    '1476d6ea-833f-43e2-a027-6e342c645d76', // JOSÉ BATISTA (R$ 20k)
    '51baf888-fb72-4809-a658-56508c8468fa'  // NOVI PISOS (R$ 5.5k)
  ];

  await supabaseAdmin
    .from('receipts')
    .update({ profile_id: pessoalProfileId })
    .in('id', revertToPessoal);

  // Recalcular totais de Janeiro
  const { data: finalReceipts } = await supabaseAdmin
    .from('receipts')
    .select('amount, transaction_type, status')
    .eq('profile_id', pessoalProfileId)
    .gte('payment_date', '2026-01-01')
    .lte('payment_date', '2026-01-31')
    .eq('status', 'approved');

  let totalDesp = 0;
  let totalInv = 0;
  finalReceipts?.forEach(r => {
    const val = Number(r.amount);
    if (r.transaction_type === 'despesa') totalDesp += val;
    else totalInv += val;
  });

  console.log(`--- RELATÓRIO FINAL ---`);
  console.log(`Soma dos 10: R$ 133879.43`);
  console.log(`Novo total Despesas: R$ ${totalDesp.toFixed(2)}`);
  console.log(`Novo total Investimentos: R$ ${totalInv.toFixed(2)}`);
  console.log(`Diferença final: Despesa R$ ${(totalDesp - 72794.70).toFixed(2)}, Investimento R$ ${(totalInv - 129734.89).toFixed(2)}`);
}
audit();
