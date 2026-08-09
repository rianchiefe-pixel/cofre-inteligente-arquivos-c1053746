import { supabaseAdmin } from './src/integrations/supabase/client.server';

async function list() {
  const { data, error } = await supabaseAdmin.rpc('get_tables');
  if (error) {
     // fallback
     const tables = ['receipts', 'categories', 'financial_profiles', 'financial_transactions', 'import_rows'];
     for (const t of tables) {
        const { data: sample } = await supabaseAdmin.from(t).select('*').limit(1);
        console.log(`Tabela: ${t} | Amostra keys:`, sample ? Object.keys(sample[0]) : 'Vazia');
     }
  } else {
     console.log('Tabelas:', data);
  }
}
list();
