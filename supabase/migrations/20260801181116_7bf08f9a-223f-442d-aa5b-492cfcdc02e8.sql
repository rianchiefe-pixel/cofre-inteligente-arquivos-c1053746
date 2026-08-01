CREATE OR REPLACE FUNCTION public.delete_receipts_safely(p_receipt_ids uuid[])
RETURNS TABLE (deleted_id uuid, safe_file_path text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  CREATE TEMP TABLE _targets ON COMMIT DROP AS
  SELECT id, file_path
  FROM public.receipts
  WHERE id = ANY(p_receipt_ids) AND user_id = v_user;

  IF NOT EXISTS (SELECT 1 FROM _targets) THEN
    RETURN;
  END IF;

  INSERT INTO public.audit_logs (user_id, action, entity, entity_id, old_value, note)
  SELECT v_user, 'deleted', 'receipt', r.id,
         jsonb_build_object('file_path', r.file_path, 'amount', r.amount, 'payment_date', r.payment_date, 'recipient_name', r.recipient_name),
         'Exclusão de lançamento'
  FROM public.receipts r JOIN _targets t ON t.id = r.id;

  DELETE FROM public.receipts r
  WHERE r.id IN (SELECT id FROM _targets) AND r.user_id = v_user;

  RETURN QUERY
  SELECT t.id,
    CASE
      WHEN t.file_path IS NULL OR t.file_path IN ('import/pending','pending') THEN NULL
      WHEN EXISTS (SELECT 1 FROM public.receipts r2 WHERE r2.file_path = t.file_path) THEN NULL
      WHEN EXISTS (SELECT 1 FROM public.import_files f WHERE f.storage_path = t.file_path) THEN NULL
      ELSE t.file_path
    END
  FROM _targets t;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_receipts_safely(uuid[]) FROM public;
GRANT EXECUTE ON FUNCTION public.delete_receipts_safely(uuid[]) TO authenticated;