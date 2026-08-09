import { supabaseAdmin } from './src/integrations/supabase/client.server';

async function list() {
  const userId = '53be3bb2-2bbc-4f66-abe7-34fdbf44064e';
  const { data: cats } = await supabaseAdmin.from('categories').select('id, name').eq('user_id', userId).order('name');
  console.log('--- CATEGORIAS LEILIANE ---');
  cats?.forEach(c => console.log(`ID: ${c.id} | Nome: ${c.name}`));
}
list();
