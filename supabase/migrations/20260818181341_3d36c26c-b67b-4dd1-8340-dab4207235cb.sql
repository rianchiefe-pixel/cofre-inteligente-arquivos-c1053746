
DO $$ BEGIN
    CREATE TYPE receipt_analysis_status AS ENUM ('processing', 'already_posted', 'possible_match', 'not_found', 'duplicate_in_zip', 'error');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS public.receipt_analysis_batches (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    file_name text NOT NULL,
    files_total integer DEFAULT 0,
    files_processed integer DEFAULT 0,
    already_found integer DEFAULT 0,
    not_found integer DEFAULT 0,
    needs_review integer DEFAULT 0,
    errors integer DEFAULT 0,
    status text NOT NULL,
    created_at timestamptz DEFAULT now(),
    finished_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.receipt_analysis_files (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id uuid REFERENCES public.receipt_analysis_batches(id) ON DELETE CASCADE NOT NULL,
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    original_path text NOT NULL,
    file_name text NOT NULL,
    content_hash text NOT NULL,
    storage_path text,
    size_bytes integer,
    analysis_status receipt_analysis_status DEFAULT 'processing',
    candidate_receipt_id uuid,
    similarity_score numeric(5,2),
    analysis_reason text,
    matched_fields jsonb,
    created_at timestamptz DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.receipt_analysis_batches TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.receipt_analysis_files TO authenticated;
GRANT ALL ON public.receipt_analysis_batches TO service_role;
GRANT ALL ON public.receipt_analysis_files TO service_role;

ALTER TABLE public.receipt_analysis_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipt_analysis_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own batches" ON public.receipt_analysis_batches
    FOR ALL TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own analysis files" ON public.receipt_analysis_files
    FOR ALL TO authenticated USING (auth.uid() = user_id);
