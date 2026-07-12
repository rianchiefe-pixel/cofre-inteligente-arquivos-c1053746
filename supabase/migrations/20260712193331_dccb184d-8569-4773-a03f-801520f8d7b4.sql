
CREATE TABLE public.import_row_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  batch_id uuid NOT NULL REFERENCES public.import_batches(id) ON DELETE CASCADE,
  row_id uuid NOT NULL REFERENCES public.import_rows(id) ON DELETE CASCADE,
  file_id uuid NOT NULL REFERENCES public.import_files(id) ON DELETE CASCADE,
  page_number integer,
  score integer NOT NULL DEFAULT 0,
  confidence text NOT NULL DEFAULT 'low',
  match_reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_manual boolean NOT NULL DEFAULT false,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (row_id, file_id, page_number)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.import_row_files TO authenticated;
GRANT ALL ON public.import_row_files TO service_role;

ALTER TABLE public.import_row_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own row-file links"
ON public.import_row_files FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_import_row_files_row ON public.import_row_files(row_id);
CREATE INDEX idx_import_row_files_file ON public.import_row_files(file_id);
CREATE INDEX idx_import_row_files_batch ON public.import_row_files(batch_id);

CREATE TRIGGER trg_import_row_files_updated
BEFORE UPDATE ON public.import_row_files
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
