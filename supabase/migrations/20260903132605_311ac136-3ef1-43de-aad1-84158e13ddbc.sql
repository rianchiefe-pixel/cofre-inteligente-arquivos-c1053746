ALTER TYPE public.receipt_analysis_status ADD VALUE IF NOT EXISTS 'unreadable';

ALTER TABLE public.receipt_analysis_files
  ADD COLUMN IF NOT EXISTS extension text,
  ADD COLUMN IF NOT EXISTS mime_type text,
  ADD COLUMN IF NOT EXISTS extracted_text text,
  ADD COLUMN IF NOT EXISTS ocr_data jsonb,
  ADD COLUMN IF NOT EXISTS ai_extracted_data jsonb,
  ADD COLUMN IF NOT EXISTS amount numeric(20,2),
  ADD COLUMN IF NOT EXISTS payment_date date,
  ADD COLUMN IF NOT EXISTS recipient_name text,
  ADD COLUMN IF NOT EXISTS recipient_tax_id text,
  ADD COLUMN IF NOT EXISTS bank_name text,
  ADD COLUMN IF NOT EXISTS payment_method text,
  ADD COLUMN IF NOT EXISTS auth_code text,
  ADD COLUMN IF NOT EXISTS transaction_id text,
  ADD COLUMN IF NOT EXISTS different_fields jsonb;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.receipt_analysis_files TO authenticated;
GRANT ALL ON public.receipt_analysis_files TO service_role;

DROP POLICY IF EXISTS "Users can manage their own analysis files" ON public.receipt_analysis_files;
CREATE POLICY "Users can manage their own analysis files"
  ON public.receipt_analysis_files
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);