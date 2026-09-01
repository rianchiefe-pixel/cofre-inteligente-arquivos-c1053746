ALTER TABLE public.property_obligations
  ADD COLUMN IF NOT EXISTS expense_behavior text NOT NULL DEFAULT 'undefined';

ALTER TABLE public.property_obligations
  DROP CONSTRAINT IF EXISTS property_obligations_expense_behavior_check;

ALTER TABLE public.property_obligations
  ADD CONSTRAINT property_obligations_expense_behavior_check
  CHECK (expense_behavior IN ('fixed', 'variable', 'credit_card', 'undefined'));