import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { randomBytes } from "crypto";

const TOKEN_PURPOSE = 'category_organization';

export const generateTempAccessToken = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ profileId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    if (!context?.supabase) {
       throw new Response('Internal Server Error', { status: 500 });
    }
    // Check if user is authenticated (admin)
    const { data: { user }, error: authError } = await context.supabase.auth.getUser();
    if (authError || !user) {
      throw new Response('Unauthorized', { status: 401 });
    }

    // Revoke existing active tokens for this profile and purpose
    await supabaseAdmin
      .from('temporary_access_tokens')
      .update({ revoked_at: new Date().toISOString(), revoked_by: user.id })
      .eq('profile_id', data.profileId)
      .eq('purpose', TOKEN_PURPOSE)
      .is('revoked_at', null)
      .gt('expires_at', new Date().toISOString());

    // Generate a secure random token
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    const { data: newToken, error } = await supabaseAdmin
      .from('temporary_access_tokens')
      .insert({
        profile_id: data.profileId,
        token: token,
        purpose: TOKEN_PURPOSE,
        expires_at: expiresAt.toISOString(),
        created_by: user.id
      })
      .select()
      .single();

    if (error) throw error;

    return newToken;
  });

export const getActiveTempAccessToken = createServerFn({ method: "GET" })
  .inputValidator((data) => z.object({ profileId: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { data: token, error } = await supabaseAdmin
      .from('temporary_access_tokens')
      .select('*')
      .eq('profile_id', data.profileId)
      .eq('purpose', TOKEN_PURPOSE)
      .is('revoked_at', null)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    return token;
  });

export const revokeTempAccessToken = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ tokenId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: { user }, error: authError } = await context.supabase.auth.getUser();
    if (authError || !user) {
      throw new Response('Unauthorized', { status: 401 });
    }

    const { error } = await supabaseAdmin
      .from('temporary_access_tokens')
      .update({ revoked_at: new Date().toISOString(), revoked_by: user.id })
      .eq('id', data.tokenId);

    if (error) throw error;
    return { success: true };
  });

export const validateTempToken = createServerFn({ method: "GET" })
  .inputValidator((data) => z.object({ token: z.string() }).parse(data))
  .handler(async ({ data }) => {
    const { data: tokenData, error } = await supabaseAdmin
      .from('temporary_access_tokens')
      .select('*, financial_profiles(name)')
      .eq('token', data.token)
      .eq('purpose', TOKEN_PURPOSE)
      .is('revoked_at', null)
      .gt('expires_at', new Date().toISOString())
      .single();

    if (error || !tokenData) {
      return { valid: false };
    }

    // Update last accessed
    await supabaseAdmin
      .from('temporary_access_tokens')
      .update({
        last_accessed_at: new Date().toISOString(),
        first_accessed_at: tokenData.first_accessed_at || new Date().toISOString(),
        access_count: (tokenData.access_count || 0) + 1
      })
      .eq('id', tokenData.id);

    return {
      valid: true,
      profileId: tokenData.profile_id,
      profileName: tokenData.financial_profiles.name,
      expiresAt: tokenData.expires_at
    };
  });
