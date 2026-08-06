import { supabaseAdmin } from "@/integrations/supabase/client.server";

export async function validateTokenAndGetProfileId(token: string | undefined) {
  if (!token) return null;

  const { data, error } = await supabaseAdmin
    .from('temporary_access_tokens')
    .select('profile_id')
    .eq('token', token)
    .eq('purpose', 'category_organization')
    .is('revoked_at', null)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  if (error || !data) return null;

  return data.profile_id;
}
