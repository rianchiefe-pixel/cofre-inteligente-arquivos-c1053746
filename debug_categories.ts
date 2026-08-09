import { supabaseAdmin } from './src/integrations/supabase/client.server';

async function run() {
  const { data: cols, error } = await supabaseAdmin.rpc('get_table_columns', { table_name: 'categories' });
  if (error) {
    // Se a RPC não existir, tenta um select simples para ver as colunas no erro ou no retorno
    const { data, error: selectError } = await supabaseAdmin.from('categories').select('*').limit(1);
    console.log('Columns sample:', data ? Object.keys(data[0]) : 'No data');
    if (selectError) console.error('Select error:', selectError);
  } else {
    console.log('Columns:', cols);
  }
}
run();
