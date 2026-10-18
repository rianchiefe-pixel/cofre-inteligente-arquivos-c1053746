CREATE TABLE public.annotations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL,
 title text NOT NULL DEFAULT '', description text NOT NULL DEFAULT '', body text NOT NULL DEFAULT '', note_date date,
 property_id uuid REFERENCES public.properties(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.annotations TO authenticated;
GRANT ALL ON public.annotations TO service_role;
ALTER TABLE public.annotations ENABLE ROW LEVEL SECURITY;
CREATE POLICY annotations_owner ON public.annotations FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid() AND (property_id IS NULL OR EXISTS (SELECT 1 FROM public.properties p WHERE p.id = property_id AND p.user_id = auth.uid())));
CREATE TABLE public.annotation_attachments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), annotation_id uuid NOT NULL REFERENCES public.annotations(id) ON DELETE CASCADE,
 user_id uuid NOT NULL, file_path text NOT NULL UNIQUE, file_name text NOT NULL, mime_type text NOT NULL DEFAULT 'application/octet-stream', size_bytes bigint NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.annotation_attachments TO authenticated;
GRANT ALL ON public.annotation_attachments TO service_role;
ALTER TABLE public.annotation_attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY annotation_attachments_owner ON public.annotation_attachments FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.annotations n WHERE n.id = annotation_id AND n.user_id = auth.uid()) AND split_part(file_path, '/', 1) = auth.uid()::text);
CREATE INDEX annotations_owner_updated ON public.annotations(user_id, updated_at DESC);
CREATE INDEX annotation_attachments_note ON public.annotation_attachments(annotation_id);
CREATE POLICY notes_storage_read ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'notes-attachments' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY notes_storage_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'notes-attachments' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY notes_storage_delete ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'notes-attachments' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE FUNCTION public.save_annotation_rpc(p_note jsonb, p_files jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE v_id uuid := (p_note->>'id')::uuid; v_user uuid := auth.uid();
BEGIN
 IF v_user IS NULL THEN RAISE EXCEPTION 'Acesso não autorizado'; END IF;
 IF coalesce(trim(p_note->>'title'), '') = '' AND coalesce(trim(p_note->>'description'), '') = '' AND coalesce(trim(p_note->>'body'), '') = '' AND jsonb_array_length(p_files) = 0 THEN RAISE EXCEPTION 'Adicione um texto ou arquivo'; END IF;
 IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_files) f WHERE split_part(f->>'file_path', '/', 1) <> v_user::text OR NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'notes-attachments' AND o.name = f->>'file_path')) THEN RAISE EXCEPTION 'Anexo inválido'; END IF;
 IF EXISTS (SELECT 1 FROM public.annotations WHERE id = v_id) THEN
 UPDATE public.annotations SET title = p_note->>'title', description = p_note->>'description', body = p_note->>'body', note_date = nullif(p_note->>'note_date', '')::date, property_id = nullif(p_note->>'property_id', '')::uuid, updated_at = now() WHERE id = v_id AND user_id = v_user;
 IF NOT FOUND THEN RAISE EXCEPTION 'Anotação não encontrada'; END IF;
 ELSE
 INSERT INTO public.annotations(id, user_id, title, description, body, note_date, property_id) VALUES(v_id, v_user, p_note->>'title', p_note->>'description', p_note->>'body', nullif(p_note->>'note_date', '')::date, nullif(p_note->>'property_id', '')::uuid);
 END IF;
 DELETE FROM public.annotation_attachments WHERE annotation_id = v_id AND NOT (file_path IN (SELECT f->>'file_path' FROM jsonb_array_elements(p_files) f));
 INSERT INTO public.annotation_attachments(annotation_id, user_id, file_path, file_name, mime_type, size_bytes)
 SELECT v_id, v_user, f->>'file_path', f->>'file_name', f->>'mime_type', (f->>'size_bytes')::bigint FROM jsonb_array_elements(p_files) f ON CONFLICT (file_path) DO NOTHING;
 RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.save_annotation_rpc(jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_annotation_rpc(jsonb, jsonb) TO authenticated, service_role;