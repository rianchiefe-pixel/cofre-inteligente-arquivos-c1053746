ALTER TABLE public.import_rows 
ADD COLUMN IF NOT EXISTS original_amount_cents bigint,
ADD COLUMN IF NOT EXISTS original_transaction_date date,
ADD COLUMN IF NOT EXISTS original_payee text,
ADD COLUMN IF NOT EXISTS original_source_id text,
ADD COLUMN IF NOT EXISTS manually_verified_amount_cents bigint,
ADD COLUMN IF NOT EXISTS ai_suggested_amount numeric,
ADD COLUMN IF NOT EXISTS ai_suggested_date date,
ADD COLUMN IF NOT EXISTS ai_suggested_payee text,
ADD COLUMN IF NOT EXISTS ai_suggestion_reason text,
ADD COLUMN IF NOT EXISTS ai_suggestion_confidence numeric;

COMMENT ON COLUMN public.import_rows.original_amount_cents IS 'Valor original da planilha em centavos (imutável)';
COMMENT ON COLUMN public.import_rows.original_transaction_date IS 'Data original da planilha (imutável)';
COMMENT ON COLUMN public.import_rows.original_payee IS 'Favorecido original da planilha (imutável)';
COMMENT ON COLUMN public.import_rows.original_source_id IS 'Identificador original da planilha (imutável)';
COMMENT ON COLUMN public.import_rows.manually_verified_amount_cents IS 'Valor verificado manualmente pelo usuário em centavos';
