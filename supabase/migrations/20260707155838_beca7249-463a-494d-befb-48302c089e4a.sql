
CREATE TABLE IF NOT EXISTS public.import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  profile_id uuid REFERENCES public.financial_profiles(id) ON DELETE SET NULL,
  file_name text,
  total_rows integer NOT NULL DEFAULT 0,
  imported_count integer NOT NULL DEFAULT 0,
  with_receipt_count integer NOT NULL DEFAULT 0,
  without_receipt_count integer NOT NULL DEFAULT 0,
  unused_files_count integer NOT NULL DEFAULT 0,
  duplicate_count integer NOT NULL DEFAULT 0,
  error_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'running',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  summary_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.import_batches TO authenticated;
GRANT ALL ON public.import_batches TO service_role;

ALTER TABLE public.import_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own import batches" ON public.import_batches
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS import_batches_user_created_idx
  ON public.import_batches(user_id, created_at DESC);

CREATE TRIGGER import_batches_touch
  BEFORE UPDATE ON public.import_batches
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.receipts
  ADD COLUMN IF NOT EXISTS import_batch_id uuid REFERENCES public.import_batches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS receipts_import_batch_idx
  ON public.receipts(import_batch_id) WHERE import_batch_id IS NOT NULL;
