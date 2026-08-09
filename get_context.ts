import { supabaseAdmin } from './src/integrations/supabase/client.server';

async function main() {
  const { data: user, error: userError } = await supabaseAdmin
    .from('profiles')
    .select('id, name, user_id')
    .eq('user_id', (await supabaseAdmin.auth.admin.listUsers()).data.users.find(u => u.email === 'advocacia@leilianepereira.com')?.id || '');

  const allUsers = await supabaseAdmin.auth.admin.listUsers();
  const targetUser = allUsers.data.users.find(u => u.email === 'advocacia@leilianepereira.com');
  
  if (!targetUser) {
    console.error("Usuário não encontrado");
    return;
  }

  const { data: profiles } = await supabaseAdmin
    .from('profiles')
    .select('*')
    .eq('user_id', targetUser.id);

  console.log(JSON.stringify({
    user_id: targetUser.id,
    profiles: profiles
  }, null, 2));
}

main();
