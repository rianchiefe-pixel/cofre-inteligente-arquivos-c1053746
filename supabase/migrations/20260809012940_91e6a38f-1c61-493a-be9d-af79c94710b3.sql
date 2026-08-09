ALTER TABLE public.receipts ADD COLUMN IF NOT EXISTS card_holder_id uuid REFERENCES public.card_holders(id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.receipts TO authenticated;
GRANT ALL ON public.receipts TO service_role;