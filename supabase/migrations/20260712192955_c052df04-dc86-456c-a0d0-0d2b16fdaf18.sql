
CREATE TABLE public.import_files (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  batch_id UUID NOT NULL REFERENCES public.import_batches(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  original_path TEXT NOT NULL,
  folder TEXT,
  file_name TEXT NOT NULL,
  extension TEXT,
  mime_type TEXT,
  size_bytes BIGINT,
  content_hash TEXT,
  storage_path TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  page_count INTEGER,
  extracted_text TEXT,
  ocr_data JSONB,
  thumbnail_path TEXT,
  duplicate_of UUID REFERENCES public.import_files(id) ON DELETE SET NULL,
  error_message TEXT,
  progress INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_import_files_batch ON public.import_files(batch_id);
CREATE INDEX idx_import_files_user ON public.import_files(user_id);
CREATE INDEX idx_import_files_hash ON public.import_files(user_id, content_hash);
CREATE INDEX idx_import_files_status ON public.import_files(batch_id, status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.import_files TO authenticated;
GRANT ALL ON public.import_files TO service_role;

ALTER TABLE public.import_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their import files"
  ON public.import_files
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER trg_import_files_updated_at
  BEFORE UPDATE ON public.import_files
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.import_batches
  ADD COLUMN IF NOT EXISTS files_total INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS files_processed INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS files_errors INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pdf_pages_processed INTEGER NOT NULL DEFAULT 0;

-- Storage policies for receipts bucket, scoped to import/<user_id>/ subfolder
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Users read own import files'
  ) THEN
    CREATE POLICY "Users read own import files" ON storage.objects
      FOR SELECT TO authenticated
      USING (bucket_id = 'receipts' AND (storage.foldername(name))[1] = 'import' AND (storage.foldername(name))[2] = auth.uid()::text);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Users upload own import files'
  ) THEN
    CREATE POLICY "Users upload own import files" ON storage.objects
      FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'receipts' AND (storage.foldername(name))[1] = 'import' AND (storage.foldername(name))[2] = auth.uid()::text);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Users delete own import files'
  ) THEN
    CREATE POLICY "Users delete own import files" ON storage.objects
      FOR DELETE TO authenticated
      USING (bucket_id = 'receipts' AND (storage.foldername(name))[1] = 'import' AND (storage.foldername(name))[2] = auth.uid()::text);
  END IF;
END$$;
