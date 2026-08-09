import { supabaseAdmin } from './src/integrations/supabase/client.server';

async function debug() {
  const { data: cols } = await supabaseAdmin.rpc('get_table_info', { t_name: 'categories' });
  console.log('Colunas categories:', cols);
  
  const { data: sample } = await supabaseAdmin.from('categories').select('*').limit(5);
  console.log('Amostra categorias:', sample);

  const { data: profiles } = await supabaseAdmin.from('financial_profiles').select('*');
  console.log('Todos os perfis:', profiles?.map(p => ({ id: p.id, name: p.name, user_id: p.user_id })));
}

debug();
