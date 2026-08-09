import { supabaseAdmin } from './src/integrations/supabase/client.server';

async function main() {
  const userId = '53be3bb2-2bbc-4f66-abe7-34fdbf44064e';
  const { data: profiles, error } = await supabaseAdmin
    .from('financial_profiles')
    .select('*')
    .eq('user_id', userId);
  
  if (error) {
    console.error(error);
    return;
  }
  
  console.log(JSON.stringify(profiles, null, 2));
}

main();
