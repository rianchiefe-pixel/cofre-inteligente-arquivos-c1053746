CREATE TABLE IF NOT EXISTS public.duplicate_checks (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    new_receipt_id uuid NOT NULL REFERENCES public.receipts(id) ON DELETE CASCADE,
    candidate_receipt_id uuid NOT NULL REFERENCES public.receipts(id) ON DELETE CASCADE,
    similarity_score integer NOT NULL DEFAULT 0,
    matched_fields text[] DEFAULT '{}',
    different_fields text[] DEFAULT '{}',
    status text NOT NULL DEFAULT 'pending',
    reviewed_at timestamp with time zone,
    reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    UNIQUE(new_receipt_id, candidate_receipt_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.duplicate_checks TO authenticated;
GRANT ALL ON public.duplicate_checks TO service_role;

ALTER TABLE public.duplicate_checks ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'duplicate_checks' AND policyname = 'Users can manage their own duplicate checks'
    ) THEN
        CREATE POLICY "Users can manage their own duplicate checks"
            ON public.duplicate_checks
            FOR ALL
            TO authenticated
            USING (auth.uid() = user_id)
            WITH CHECK (auth.uid() = user_id);
    END IF;
END $$;

CREATE OR REPLACE TRIGGER trg_touch_duplicate_checks 
BEFORE UPDATE ON public.duplicate_checks 
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();