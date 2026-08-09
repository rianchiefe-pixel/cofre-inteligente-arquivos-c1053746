import { supabaseAdmin } from './src/integrations/supabase/client.server';

async function listAll() {
  console.log('--- Listing All Profiles ---');
  const { data: profiles, error: pErr } = await supabaseAdmin.from('financial_profiles').select('id, name, user_id');
  if (pErr) throw pErr;
  
  const userIds = new Set(profiles.map(p => p.user_id));
  console.log(`Found ${profiles.length} profiles for ${userIds.size} unique users.`);
  
  for (const uid of userIds) {
    const { data: user, error: uErr } = await supabaseAdmin.auth.admin.getUserById(uid);
    console.log(`User ID: ${uid} | Email: ${user?.user?.email || 'N/A'}`);
    const userProfiles = profiles.filter(p => p.user_id === uid);
    userProfiles.forEach(p => console.log(`  - Profile: ${p.name} (${p.id})`));
  }
}

listAll().catch(console.error);
