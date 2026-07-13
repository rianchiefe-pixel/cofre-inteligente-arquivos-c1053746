CREATE UNIQUE INDEX IF NOT EXISTS import_row_files_one_primary_file_per_batch_idx
ON public.import_row_files (batch_id, file_id)
WHERE is_primary = true;