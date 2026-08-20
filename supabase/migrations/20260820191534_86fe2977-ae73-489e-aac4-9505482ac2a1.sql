
-- Drop existing restrictive storage policies for property_documents
DROP POLICY IF EXISTS "Users can upload their own documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can view their own documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own documents" ON storage.objects;

-- Storage policies: Check access via user_id folder in path
CREATE POLICY "Users can upload property documents"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'property_documents' AND 
  (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can view property documents"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'property_documents' AND 
  (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can delete property documents"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'property_documents' AND 
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Database policies: Ensure robust user_id checking
DROP POLICY IF EXISTS "own documents" ON public.property_documents;
CREATE POLICY "own documents" 
ON public.property_documents 
FOR ALL TO authenticated 
USING (auth.uid() = user_id) 
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "own document links" ON public.property_document_links;
CREATE POLICY "own document links" 
ON public.property_document_links 
FOR ALL TO authenticated 
USING (auth.uid() = user_id) 
WITH CHECK (auth.uid() = user_id);
