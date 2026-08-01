-- Corrige o upsert do vínculo manual (a unicidade real é row_id+file_id+page_number)
CREATE OR REPLACE FUNCTION public.attach_receipt_file_rpc(
  p_row_id uuid,
  p_file_id uuid,
  p_make_primary boolean DEFAULT true
)
RETURNS TABLE(link_id uuid, is_primary boolean, confidence text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := public.require_permission('editReceipts');
  v_row public.import_rows%ROWTYPE;
  v_file public.import_files%ROWTYPE;
  v_link_id uuid;
  v_reasons jsonb := jsonb_build_array(jsonb_build_object('type','manual','detail','Vinculado manualmente'));
BEGIN
  SELECT * INTO v_row FROM public.import_rows WHERE id = p_row_id AND user_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Linha não encontrada' USING ERRCODE='42501'; END IF;

  SELECT * INTO v_file FROM public.import_files WHERE id = p_file_id AND user_id = v_uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'Arquivo não encontrado' USING ERRCODE='42501'; END IF;
  IF v_file.batch_id <> v_row.batch_id THEN
    RAISE EXCEPTION 'Arquivo pertence a outro lote' USING ERRCODE='42501';
  END IF;
  IF nullif(btrim(COALESCE(v_file.storage_path,'')),'') IS NULL
     OR v_file.storage_path IN ('import/pending','pending') THEN
    RAISE EXCEPTION 'Arquivo sem caminho real no armazenamento';
  END IF;

  IF p_make_primary THEN
    UPDATE public.import_row_files SET is_primary = false, updated_at = now()
    WHERE row_id = v_row.id AND user_id = v_uid AND file_id <> p_file_id AND is_primary;
  END IF;

  SELECT id INTO v_link_id FROM public.import_row_files
  WHERE row_id = v_row.id AND file_id = p_file_id AND user_id = v_uid
  ORDER BY is_primary DESC LIMIT 1
  FOR UPDATE;

  IF v_link_id IS NULL THEN
    INSERT INTO public.import_row_files (
      user_id, batch_id, row_id, file_id, score, confidence,
      match_reasons, is_manual, is_primary
    ) VALUES (
      v_uid, v_row.batch_id, v_row.id, p_file_id, 100, 'manual_confirmed',
      v_reasons, true, p_make_primary
    )
    RETURNING id INTO v_link_id;
  ELSE
    UPDATE public.import_row_files
    SET is_manual = true, is_primary = p_make_primary,
        confidence = 'manual_confirmed', match_reasons = v_reasons,
        score = GREATEST(score, 100), updated_at = now()
    WHERE id = v_link_id;
  END IF;

  INSERT INTO public.audit_logs (user_id, action, entity, entity_id, new_value, note)
  VALUES (v_uid, 'linked', 'import_row_file', v_link_id,
          jsonb_build_object('row_id', v_row.id, 'file_id', p_file_id, 'is_primary', p_make_primary),
          'Vínculo manual de comprovante');

  RETURN QUERY SELECT irf.id, irf.is_primary, irf.confidence
  FROM public.import_row_files irf WHERE irf.id = v_link_id;
END; $$;

REVOKE ALL ON FUNCTION public.attach_receipt_file_rpc(uuid, uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.attach_receipt_file_rpc(uuid, uuid, boolean) TO authenticated;

-- Nenhuma rotina interna deve ser executável por visitante anônimo.
DO $do$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon, PUBLIC', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
  END LOOP;
END $do$;