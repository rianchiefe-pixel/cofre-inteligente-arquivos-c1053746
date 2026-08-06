CREATE TABLE public.temporary_access_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL REFERENCES public.financial_profiles(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE,
    purpose TEXT NOT NULL DEFAULT 'category_organization',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    revoked_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    first_accessed_at TIMESTAMPTZ,
    last_accessed_at TIMESTAMPTZ,
    access_count INTEGER NOT NULL DEFAULT 0,
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Index for fast token lookup
CREATE INDEX idx_temp_tokens_token ON public.temporary_access_tokens(token);

-- RLS
ALTER TABLE public.temporary_access_tokens ENABLE ROW LEVEL SECURITY;

-- Admins (authenticated users) can manage tokens
CREATE POLICY "Admins can manage temporary tokens"
ON public.temporary_access_tokens
FOR ALL
TO authenticated
USING (true);

-- No anon access to the table directly (we'll use server functions)
GRANT ALL ON public.temporary_access_tokens TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.temporary_access_tokens TO authenticated;