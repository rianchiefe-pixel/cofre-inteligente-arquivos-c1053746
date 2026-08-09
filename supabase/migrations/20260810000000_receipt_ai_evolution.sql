-- Adiciona colunas para suportar o fluxo inteligente de identificação e pré-classificação
ALTER TABLE public.receipts 
ADD COLUMN IF NOT EXISTS ai_confidence text CHECK (ai_confidence IN ('ALTA', 'MEDIA', 'BAIXA', 'NAO_IDENTIFICADO')),
ADD COLUMN IF NOT EXISTS ai_reason text,
ADD COLUMN IF NOT EXISTS ai_suggested_profile_id uuid REFERENCES public.financial_profiles(id),
ADD COLUMN IF NOT EXISTS ai_suggested_category_id uuid REFERENCES public.categories(id),
ADD COLUMN IF NOT EXISTS ai_extracted_data jsonb,
ADD COLUMN IF NOT EXISTS ai_history_summary jsonb,
ADD COLUMN IF NOT EXISTS user_confirmed_at timestamptz,
ADD COLUMN IF NOT EXISTS is_manual_correction boolean DEFAULT false;

-- Comentários para documentação
COMMENT ON COLUMN public.receipts.ai_confidence IS 'Nível de confiança da sugestão da IA';
COMMENT ON COLUMN public.receipts.ai_reason IS 'Explicação amigável do motivo da sugestão';
COMMENT ON COLUMN public.receipts.ai_extracted_data IS 'Dados estruturados extraídos pelo OCR semântico';
COMMENT ON COLUMN public.receipts.ai_history_summary IS 'Resumo do histórico do favorecido usado para a decisão';

-- Garantir que as permissões estejam corretas (embora já devam estar)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.receipts TO authenticated;
GRANT ALL ON public.receipts TO service_role;
