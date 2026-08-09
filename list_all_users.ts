import { supabaseAdmin } from './src/integrations/supabase/client.server';

async function run() {
  const { data: users, error: userError } = await supabaseAdmin.auth.admin.listUsers();
  if (userError) {
    console.error('Erro ao listar usuários:', userError);
    return;
  }
  
  console.log('Total de usuários:', users.users.length);
  users.users.forEach(u => {
    console.log(`- ${u.email} (${u.id})`);
  });
}

run();
