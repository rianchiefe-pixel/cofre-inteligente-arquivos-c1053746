
ALTER TABLE public.cards ADD COLUMN IF NOT EXISTS credit_limit numeric;

-- card_holders: adicionais/complementares
CREATE TABLE IF NOT EXISTS public.card_holders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id uuid NOT NULL REFERENCES public.cards(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  holder_name text NOT NULL,
  last4 text,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS card_holders_card_idx ON public.card_holders(card_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.card_holders TO authenticated;
GRANT ALL ON public.card_holders TO service_role;
ALTER TABLE public.card_holders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own card_holders" ON public.card_holders FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_card_holders_updated BEFORE UPDATE ON public.card_holders
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- card_statements
CREATE TABLE IF NOT EXISTS public.card_statements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id uuid NOT NULL REFERENCES public.cards(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  bank_name text,
  period_start date,
  period_end date,
  closing_date date,
  due_date date,
  total_amount numeric,
  minimum_payment numeric,
  source_file_path text,
  source_file_name text,
  source_hash text,
  status text NOT NULL DEFAULT 'processing',
  progress_stage text,
  progress_pct int DEFAULT 0,
  pages_total int,
  raw_analysis jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, card_id, source_hash)
);
CREATE INDEX IF NOT EXISTS card_statements_card_idx ON public.card_statements(card_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.card_statements TO authenticated;
GRANT ALL ON public.card_statements TO service_role;
ALTER TABLE public.card_statements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own card_statements" ON public.card_statements FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_card_statements_updated BEFORE UPDATE ON public.card_statements
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- card_transactions
CREATE TABLE IF NOT EXISTS public.card_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  statement_id uuid NOT NULL REFERENCES public.card_statements(id) ON DELETE CASCADE,
  card_id uuid NOT NULL REFERENCES public.cards(id) ON DELETE CASCADE,
  card_holder_id uuid REFERENCES public.card_holders(id) ON DELETE SET NULL,
  user_id uuid NOT NULL,
  txn_date date,
  description text,
  amount numeric,
  currency text DEFAULT 'BRL',
  country text,
  installment_current int,
  installment_total int,
  last4 text,
  holder_name text,
  category text,
  kind text DEFAULT 'compra',
  property_id uuid,
  profile_id uuid,
  confidence numeric,
  low_confidence boolean DEFAULT false,
  status text NOT NULL DEFAULT 'pending',
  original_series_id text,
  notes text,
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS card_tx_statement_idx ON public.card_transactions(statement_id);
CREATE INDEX IF NOT EXISTS card_tx_card_idx ON public.card_transactions(card_id, txn_date);
CREATE INDEX IF NOT EXISTS card_tx_series_idx ON public.card_transactions(card_id, original_series_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.card_transactions TO authenticated;
GRANT ALL ON public.card_transactions TO service_role;
ALTER TABLE public.card_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own card_transactions" ON public.card_transactions FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_card_tx_updated BEFORE UPDATE ON public.card_transactions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
