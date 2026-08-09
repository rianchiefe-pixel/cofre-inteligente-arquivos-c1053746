import { supabaseAdmin } from './src/integrations/supabase/client.server';

async function main() {
  const profileId = 'c44c244d-b05f-47dc-bc58-7056351e7703'; // Pessoal
  const userId = '53be3bb2-2bbc-4f66-abe7-34fdbf44064e';

  // 1. Teste Arbos 29/06/2026
  const { data: arbos } = await supabaseAdmin
    .from('receipts')
    .select('recipient_name, amount, payment_date, categories(name)')
    .eq('profile_id', profileId)
    .eq('amount', 3996)
    .eq('auth_code', '4621CA56766C9C9383EF9F39FCB8C7FDC867EA31')
    .single();

  console.log("TESTE ARBOS (29/06/2026):");
  console.log(JSON.stringify(arbos, null, 2));

  // 2. Verificar Auditoria Recente
  const { data: audits } = await supabaseAdmin
    .from('audit_logs')
    .select('action, note, created_at, old_value, new_value')
    .eq('user_id', userId)
    .eq('action', 'transaction_category_updated')
    .order('created_at', { ascending: false })
    .limit(5);

  console.log("\nAUDITORIAS RECENTES:");
  console.log(JSON.stringify(audits, null, 2));
}

main();
