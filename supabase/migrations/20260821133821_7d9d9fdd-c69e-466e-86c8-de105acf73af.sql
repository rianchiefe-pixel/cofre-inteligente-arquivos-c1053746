-- 1. Adiciona o vínculo com credenciais nas obrigações
ALTER TABLE public.property_obligations 
ADD COLUMN IF NOT EXISTS credential_id uuid REFERENCES public.property_credentials(id) ON DELETE SET NULL;

-- 2. Adiciona suporte para identificar credenciais PF se necessário (opcional, mas útil para filtros futuros)
-- O usuário já pediu "Permitir usar este acesso em outras Obrigações PF", sugerindo que as credenciais são transversais.
-- A tabela property_credentials já é vinculada a auth.uid(), então já está segura por usuário.

-- 3. Habilita acesso de dados para o campo novo
GRANT UPDATE(credential_id) ON public.property_obligations TO authenticated;
GRANT SELECT ON public.property_credentials TO authenticated;

-- 4. Comentário explicativo
COMMENT ON COLUMN public.property_obligations.credential_id IS 'Vínculo com uma credencial centralizada (Acessos).';
