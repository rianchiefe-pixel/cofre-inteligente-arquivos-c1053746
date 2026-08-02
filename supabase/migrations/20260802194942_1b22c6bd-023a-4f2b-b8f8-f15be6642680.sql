ALTER TABLE public.import_files
  ADD COLUMN IF NOT EXISTS document_type text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS exclusion_reason text;

ALTER TABLE public.card_statements
  ADD COLUMN IF NOT EXISTS batch_id uuid REFERENCES public.import_batches(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS import_file_id uuid REFERENCES public.import_files(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS document_type text NOT NULL DEFAULT 'credit_card_statement';

ALTER TABLE public.card_statements ALTER COLUMN card_id DROP NOT NULL;

ALTER TABLE public.card_transactions
  ADD COLUMN IF NOT EXISTS merchant_normalized text,
  ADD COLUMN IF NOT EXISTS page_number integer,
  ADD COLUMN IF NOT EXISTS raw_text text,
  ADD COLUMN IF NOT EXISTS matched_import_row_id uuid REFERENCES public.import_rows(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS match_status text NOT NULL DEFAULT 'unmatched',
  ADD COLUMN IF NOT EXISTS match_score integer;

ALTER TABLE public.card_transactions ALTER COLUMN card_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS card_statements_batch_idx ON public.card_statements (batch_id);
CREATE INDEX IF NOT EXISTS card_statements_file_idx ON public.card_statements (import_file_id);
CREATE INDEX IF NOT EXISTS card_transactions_match_idx ON public.card_transactions (matched_import_row_id);
CREATE INDEX IF NOT EXISTS card_transactions_statement_idx ON public.card_transactions (statement_id);
CREATE INDEX IF NOT EXISTS import_files_batch_status_idx ON public.import_files (batch_id, status);