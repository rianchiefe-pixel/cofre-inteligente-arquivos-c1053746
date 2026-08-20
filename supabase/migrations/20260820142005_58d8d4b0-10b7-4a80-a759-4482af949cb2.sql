
-- 1. Tabela de vínculos N:N para credenciais compartilhadas
CREATE TABLE IF NOT EXISTS public.property_credential_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    credential_id UUID NOT NULL REFERENCES public.property_credentials(id) ON DELETE CASCADE,
    property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(credential_id, property_id)
);

GRANT SELECT, INSERT, DELETE ON public.property_credential_links TO authenticated;
GRANT ALL ON public.property_credential_links TO service_role;

ALTER TABLE public.property_credential_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_credential_links" ON public.property_credential_links
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.property_credentials c
            WHERE c.id = credential_id AND c.user_id = auth.uid()
        )
    );

-- 2. Migração inicial: Mover o property_id original para a tabela de vínculos
INSERT INTO public.property_credential_links (credential_id, property_id)
SELECT id, property_id FROM public.property_credentials
ON CONFLICT DO NOTHING;

-- 3. Extensão de property_obligations com campos específicos
ALTER TABLE public.property_obligations
    ADD COLUMN IF NOT EXISTS installation_number TEXT,
    ADD COLUMN IF NOT EXISTS consumer_unit TEXT,
    ADD COLUMN IF NOT EXISTS registration_number TEXT,
    ADD COLUMN IF NOT EXISTS client_number TEXT,
    ADD COLUMN IF NOT EXISTS contract_number TEXT,
    ADD COLUMN IF NOT EXISTS real_estate_tax_id TEXT,
    ADD COLUMN IF NOT EXISTS credential_id UUID REFERENCES public.property_credentials(id) ON DELETE SET NULL;

-- 4. Função para gerenciar múltiplos vínculos de credenciais
CREATE OR REPLACE FUNCTION public.sync_property_credential_links(
    p_credential_id UUID,
    p_property_ids UUID[]
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_uid UUID := auth.uid();
BEGIN
    -- Verifica se o usuário é dono da credencial
    PERFORM 1 FROM public.property_credentials WHERE id = p_credential_id AND user_id = v_uid;
    IF NOT FOUND THEN RAISE EXCEPTION 'Acesso negado' USING ERRCODE='42501'; END IF;

    -- Remove vínculos que não estão no novo array
    DELETE FROM public.property_credential_links
    WHERE credential_id = p_credential_id
      AND property_id != ALL(p_property_ids);

    -- Adiciona novos vínculos
    INSERT INTO public.property_credential_links (credential_id, property_id)
    SELECT p_credential_id, unnest(p_property_ids)
    ON CONFLICT DO NOTHING;
END; $$;

GRANT EXECUTE ON FUNCTION public.sync_property_credential_links(UUID, UUID[]) TO authenticated;
