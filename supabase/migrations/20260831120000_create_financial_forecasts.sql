-- Previsões manuais são planejamento; nunca criam ou alteram receipts.
CREATE TABLE IF NOT EXISTS public.financial_forecasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  profile_id uuid REFERENCES public.financial_profiles(id) ON DELETE CASCADE,
  property_id uuid REFERENCES public.properties(id) ON DELETE SET NULL,
  category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
  card_id uuid REFERENCES public.cards(id) ON DELETE SET NULL,
  description text NOT NULL,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  start_date date NOT NULL,
  end_date date,
  kind text NOT NULL CHECK (kind IN ('fixed','variable','expected','investment')),
  recurrence text NOT NULL DEFAULT 'once' CHECK (recurrence IN ('once','mensal','bimestral','trimestral','semestral','anual')),
  occurrence_count integer CHECK (occurrence_count IS NULL OR occurrence_count > 0),
  recipient_name text,
  payment_method text,
  notes text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','realized','cancelled')),
  realized_receipt_id uuid REFERENCES public.receipts(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date IS NULL OR end_date >= start_date)
);

ALTER TABLE public.financial_forecasts ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.financial_forecasts TO authenticated;
GRANT ALL ON public.financial_forecasts TO service_role;
CREATE POLICY "own financial forecasts" ON public.financial_forecasts FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_financial_forecasts_user_dates ON public.financial_forecasts(user_id, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_financial_forecasts_profile ON public.financial_forecasts(profile_id);
CREATE INDEX IF NOT EXISTS idx_financial_forecasts_property ON public.financial_forecasts(property_id);
CREATE TRIGGER trg_financial_forecasts_touch BEFORE UPDATE ON public.financial_forecasts FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- O legado de faturas não distinguia aprovação de quitação. Campos opcionais
-- permitem liquidar a competência sem criar um novo lançamento/despesa.
ALTER TABLE public.card_statements ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'open' CHECK (payment_status IN ('open','paid','cancelled'));
ALTER TABLE public.card_statements ADD COLUMN IF NOT EXISTS paid_at timestamptz;
