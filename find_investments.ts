import { supabaseAdmin } from './src/integrations/supabase/client.server';

async function audit() {
  const startDate = '2026-01-01';
  const endDate = '2026-01-31';

  const { data: allInvests, error } = await supabaseAdmin
    .from('receipts')
    .select('id, amount, recipient_name, profile_id, bank_name, status')
    .eq('transaction_type', 'investimento')
    .gte('payment_date', startDate)
    .lte('payment_date', endDate)
    .eq('status', 'approved');

  if (error) {
    console.error(error);
    return;
  }

  const { data: profiles } = await supabaseAdmin.from('financial_profiles').select('id, name');
  const profileMap = Object.fromEntries(profiles?.map(p => [p.id, p.name]) || []);

  console.table(allInvests?.map(i => ({
    id: i.id.substring(0,8),
    valor: Number(i.amount),
    favorecido: i.recipient_name,
    perfil: profileMap[i.profile_id!] || 'Desconhecido',
    banco: i.bank_name
  })).sort((a,b) => b.valor - a.valor));
}
audit();
