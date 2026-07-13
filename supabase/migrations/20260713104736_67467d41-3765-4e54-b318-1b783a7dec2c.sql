
ALTER TABLE public.import_rows
  ADD COLUMN IF NOT EXISTS property_id uuid REFERENCES public.properties(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS general_account boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS category_original text,
  ADD COLUMN IF NOT EXISTS ai_property_id uuid REFERENCES public.properties(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ai_property_confidence numeric(4,3),
  ADD COLUMN IF NOT EXISTS ai_property_reason text,
  ADD COLUMN IF NOT EXISTS ai_category_suggestion text,
  ADD COLUMN IF NOT EXISTS ai_category_confidence numeric(4,3),
  ADD COLUMN IF NOT EXISTS ai_category_reason text;

CREATE INDEX IF NOT EXISTS import_rows_property_idx ON public.import_rows (property_id);

ALTER TABLE public.import_batches
  ADD COLUMN IF NOT EXISTS scope_kind text NOT NULL DEFAULT 'profile';

UPDATE public.import_rows
   SET category_original = category
 WHERE category_original IS NULL
   AND category IS NOT NULL;
