-- ============ property_documents ============
CREATE TABLE IF NOT EXISTS public.property_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES public.financial_profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size INTEGER,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.property_documents TO authenticated;
GRANT ALL ON public.property_documents TO service_role;
ALTER TABLE public.property_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own documents" ON public.property_documents FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============ property_document_links ============
CREATE TABLE IF NOT EXISTS public.property_document_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES public.property_documents(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(document_id, property_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.property_document_links TO authenticated;
GRANT ALL ON public.property_document_links TO service_role;
ALTER TABLE public.property_document_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own document links" ON public.property_document_links FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
