-- A restrição única deve ser total para suportar ON CONFLICT, não parcial.
DROP INDEX IF EXISTS receipts_import_row_id_unique;

ALTER TABLE public.receipts
DROP CONSTRAINT IF EXISTS receipts_import_row_id_unique_constraint;

ALTER TABLE public.receipts
ADD CONSTRAINT receipts_import_row_id_unique_constraint UNIQUE (import_row_id);
