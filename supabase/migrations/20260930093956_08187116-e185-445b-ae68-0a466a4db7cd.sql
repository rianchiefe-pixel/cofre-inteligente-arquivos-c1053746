CREATE TABLE IF NOT EXISTS public.financial_forecasts_backup_20260930 AS SELECT * FROM public.financial_forecasts;
REVOKE ALL ON public.financial_forecasts_backup_20260930 FROM anon, authenticated;
GRANT ALL ON public.financial_forecasts_backup_20260930 TO service_role;
ALTER TABLE public.financial_forecasts_backup_20260930 ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.financial_forecasts ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'manual';
ALTER TABLE public.financial_forecasts ADD COLUMN IF NOT EXISTS bank_id uuid REFERENCES public.banks(id) ON DELETE SET NULL;
UPDATE public.financial_forecasts SET origin = 'credit_card'
 WHERE origin = 'manual' AND card_id IS NOT NULL AND payment_method IN ('credito_parcelado','credito_vista','credit_card');

ALTER TABLE public.property_obligations ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL;
ALTER TABLE public.property_obligations ADD COLUMN IF NOT EXISTS bank_id uuid REFERENCES public.banks(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.forecast_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  source_type text NOT NULL,
  source_id text NOT NULL,
  occurrence_date date NOT NULL,
  action text NOT NULL DEFAULT 'override',
  amount numeric,
  description text,
  category_id uuid,
  account_id uuid,
  bank_id uuid,
  card_id uuid,
  kind text,
  payment_method text,
  date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, source_type, source_id, occurrence_date)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.forecast_overrides TO authenticated;
GRANT ALL ON public.forecast_overrides TO service_role;
ALTER TABLE public.forecast_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner manages forecast overrides" ON public.forecast_overrides FOR ALL TO authenticated
 USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER forecast_overrides_touch BEFORE UPDATE ON public.forecast_overrides
 FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();