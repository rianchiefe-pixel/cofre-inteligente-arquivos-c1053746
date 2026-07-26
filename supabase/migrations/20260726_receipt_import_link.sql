-- Adiciona vínculo idempotente entre import_rows e receipts
ALTER TABLE public.receipts 
ADD COLUMN IF NOT EXISTS import_row_id uuid NULL REFERENCES public.import_rows(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS import_batch_id uuid NULL REFERENCES public.import_batches(id) ON DELETE SET NULL;

-- Crie uma restrição única parcial para evitar duplicidade de lançamentos por linha de importação
CREATE UNIQUE INDEX IF NOT EXISTS receipts_import_row_id_unique 
ON public.receipts(import_row_id) 
WHERE import_row_id IS NOT NULL;

-- Garante acesso à API
GRANT SELECT, INSERT, UPDATE, DELETE ON public.receipts TO authenticated;
GRANT ALL ON public.receipts TO service_role;
