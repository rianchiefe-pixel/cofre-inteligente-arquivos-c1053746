-- Extend import_batches with parsing/progress metadata
ALTER TABLE public.import_batches
  ADD COLUMN IF NOT EXISTS file_size bigint,
  ADD COLUMN IF NOT EXISTS file_mime text,
  ADD COLUMN IF NOT EXISTS separator text,
  ADD COLUMN IF NOT EXISTS header_row integer,
  ADD COLUMN IF NOT EXISTS header_columns jsonb,
  ADD COLUMN IF NOT EXISTS column_mapping jsonb,
  ADD COLUMN IF NOT EXISTS phase text NOT NULL DEFAULT 'received',
  ADD COLUMN IF NOT EXISTS progress_percent integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS parsed_rows integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS normalized_rows integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS saved_rows integer NOT NULL DEFAULT 0;

-- Per-row storage (raw + normalized preserved forever)
CREATE TABLE IF NOT EXISTS public.import_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  batch_id uuid NOT NULL REFERENCES public.import_batches(id) ON DELETE CASCADE,
  row_number integer NOT NULL,
  raw_data jsonb NOT NULL,
  normalized_data jsonb,
  amount numeric(14,2),
  currency text,
  transaction_date date,
  category text,
  account text,
  description text,
  notes text,
  parsed_notes jsonb,
  status text NOT NULL DEFAULT 'pending',
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.import_rows TO authenticated;
GRANT ALL ON public.import_rows TO service_role;

ALTER TABLE public.import_rows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own import rows"
  ON public.import_rows
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS import_rows_batch_idx
  ON public.import_rows(batch_id, row_number);
CREATE INDEX IF NOT EXISTS import_rows_user_idx
  ON public.import_rows(user_id, created_at DESC);