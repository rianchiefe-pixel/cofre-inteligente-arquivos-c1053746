-- Update property_obligations table for Personal Obligations (PF)
ALTER TABLE public.property_obligations ALTER COLUMN property_id DROP NOT NULL;
ALTER TABLE public.property_obligations ADD COLUMN IF NOT EXISTS is_personal BOOLEAN DEFAULT FALSE;

-- Drop and recreate kind constraint to include PF kinds
ALTER TABLE public.property_obligations DROP CONSTRAINT IF EXISTS property_obligations_kind_check;
ALTER TABLE public.property_obligations ADD CONSTRAINT property_obligations_kind_check 
    CHECK (kind = ANY (ARRAY['iptu', 'lixo', 'condominio', 'agua', 'energia', 'internet', 'limpeza', 'gas', 'irpf', 'itr', 'inss', 'certificado_digital', 'taxa', 'servico', 'outro_pf', 'outro']));

-- Create join table for multi-category support in obligations
CREATE TABLE IF NOT EXISTS public.property_obligation_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    obligation_id UUID NOT NULL REFERENCES public.property_obligations(id) ON DELETE CASCADE,
    category_id UUID NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(obligation_id, category_id)
);

-- Enable RLS and set grants
ALTER TABLE public.property_obligation_categories ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.property_obligation_categories TO authenticated;
GRANT ALL ON public.property_obligation_categories TO service_role;

-- RLS Policy for join table
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'property_obligation_categories' 
        AND policyname = 'own obligation categories'
    ) THEN
        CREATE POLICY "own obligation categories" ON public.property_obligation_categories
            FOR ALL TO authenticated USING (
                EXISTS (
                    SELECT 1 FROM public.property_obligations 
                    WHERE id = obligation_id AND user_id = auth.uid()
                )
            );
    END IF;
END $$;