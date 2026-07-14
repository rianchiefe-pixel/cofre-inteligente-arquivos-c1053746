-- Adiciona classificação de tipo de lançamento (kind) para segregar transações
-- de cartão de crédito antes do cruzamento com comprovantes.
ALTER TABLE public.import_rows
  ADD COLUMN IF NOT EXISTS kind text;

CREATE INDEX IF NOT EXISTS import_rows_kind_idx
  ON public.import_rows (batch_id, kind);

-- Marca legibilidade dos comprovantes processados.
ALTER TABLE public.import_files
  ADD COLUMN IF NOT EXISTS readable boolean;

CREATE INDEX IF NOT EXISTS import_files_readable_idx
  ON public.import_files (batch_id, readable);