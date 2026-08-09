ALTER TABLE public.receipts 
ADD COLUMN IF NOT EXISTS ai_confidence text CHECK (ai_confidence IN ('ALTA', 'MEDIA', 'BAIXA', 'NAO_IDENTIFICADO')),
ADD COLUMN IF NOT EXISTS ai_reason text,
ADD COLUMN IF NOT EXISTS ai_suggested_profile_id uuid REFERENCES public.financial_profiles(id),
ADD COLUMN IF NOT EXISTS ai_suggested_category_id uuid REFERENCES public.categories(id),
ADD COLUMN IF NOT EXISTS ai_extracted_data jsonb,
ADD COLUMN IF NOT EXISTS ai_history_summary jsonb,
ADD COLUMN IF NOT EXISTS user_confirmed_at timestamptz,
ADD COLUMN IF NOT EXISTS is_manual_correction boolean DEFAULT false;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.receipts TO authenticated;
GRANT ALL ON public.receipts TO service_role;