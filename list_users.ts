import { supabaseAdmin } from './src/integrations/supabase/client.server';

async function main() {
  const { data: users, error } = await supabaseAdmin.auth.admin.listUsers();
  if (error) {
    console.error(error);
    return;
  }
  console.log("Usuários encontrados:");
  users.users.forEach(u => console.log(`- ${u.email} (${u.id})`));
}

main();
