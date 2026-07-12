-- Extend import_rows with AI classification fields
ALTER TABLE public.import_rows
  ADD COLUMN IF NOT EXISTS transaction_type text CHECK (transaction_type IN ('DESPESA','INVESTIMENTO')),
  ADD COLUMN IF NOT EXISTS subcategory text,
  ADD COLUMN IF NOT EXISTS payee text,
  ADD COLUMN IF NOT EXISTS bank text,
  ADD COLUMN IF NOT EXISTS card text,
  ADD COLUMN IF NOT EXISTS card_last4 text,
  ADD COLUMN IF NOT EXISTS payment_method text,
  ADD COLUMN IF NOT EXISTS holder text,
  ADD COLUMN IF NOT EXISTS file_name text,
  ADD COLUMN IF NOT EXISTS folder_path text,
  ADD COLUMN IF NOT EXISTS source_id text,
  ADD COLUMN IF NOT EXISTS invoice_number text,
  ADD COLUMN IF NOT EXISTS page_number text,
  ADD COLUMN IF NOT EXISTS ai_data jsonb,
  ADD COLUMN IF NOT EXISTS ai_meta jsonb,
  ADD COLUMN IF NOT EXISTS ai_status text NOT NULL DEFAULT 'not_classified',
  ADD COLUMN IF NOT EXISTS ai_error text,
  ADD COLUMN IF NOT EXISTS review_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;

CREATE INDEX IF NOT EXISTS import_rows_ai_status_idx
  ON public.import_rows(batch_id, ai_status);
CREATE INDEX IF NOT EXISTS import_rows_review_status_idx
  ON public.import_rows(batch_id, review_status);

-- User learning: aliases and corrections registered from approved rows.
CREATE TABLE IF NOT EXISTS public.import_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  field text NOT NULL,           -- 'bank' | 'card' | 'category' | 'payee' | 'payment_method'
  raw_key text NOT NULL,         -- normalized lowercase key
  corrected_value text NOT NULL,
  usage_count integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, field, raw_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.import_preferences TO authenticated;
GRANT ALL ON public.import_preferences TO service_role;

ALTER TABLE public.import_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own import preferences"
  ON public.import_preferences
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS import_preferences_lookup_idx
  ON public.import_preferences(user_id, field, raw_key);

CREATE TRIGGER import_preferences_touch
  BEFORE UPDATE ON public.import_preferences
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();