import { supabaseAdmin } from './src/integrations/supabase/client.server';

async function audit() {
  const startDate = '2026-01-01';
  const endDate = '2026-01-31';

  // Buscar todos os investimentos de Janeiro em QUALQUER perfil
  const { data: allInvests } = await supabaseAdmin
    .from('receipts')
    .select('id, amount, recipient_name, profile_id, bank_name, status, financial_profiles(name)')
    .eq('transaction_type', 'investimento')
    .gte('payment_date', startDate)
    .lte('payment_date', endDate)
    .eq('status', 'approved');

  console.table(allInvests?.map(i => ({
    id: i.id.substring(0,8),
    valor: i.amount,
    favorecido: i.recipient_name,
    perfil: i.financial_profiles?.name,
    banco: i.bank_name
  })));
}
audit();
