import { supabaseAdmin } from './src/integrations/supabase/client.server';

async function listUsers() {
  const { data: { users }, error } = await supabaseAdmin.auth.admin.listUsers();
  if (error) {
    console.error(error);
    return;
  }
  console.log('--- USUÁRIOS NO BANCO ---');
  users.forEach(u => console.log(`Email: ${u.email} | ID: ${u.id}`));
}

listUsers();
