CREATE OR REPLACE FUNCTION public.reset_demo_data_rpc()
RETURNS TABLE(receipts_removed integer, rows_removed integer, files_removed integer, storage_paths text[])
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := public.require_permission('deleteData');
  v_receipts integer := 0;
  v_rows integer := 0;
  v_files integer := 0;
  v_paths text[];
BEGIN
  SELECT COALESCE(array_agg(DISTINCT p), ARRAY[]::text[]) INTO v_paths FROM (
    SELECT file_path AS p FROM public.receipts
      WHERE user_id = v_uid AND file_path IS NOT NULL AND file_path NOT IN ('import/pending','pending')
    UNION
    SELECT storage_path FROM public.import_files
      WHERE user_id = v_uid AND storage_path IS NOT NULL AND storage_path NOT IN ('import/pending','pending')
    UNION
    SELECT source_file_path FROM public.card_statements
      WHERE user_id = v_uid AND source_file_path IS NOT NULL
  ) s;

  DELETE FROM public.card_transactions WHERE user_id = v_uid;
  DELETE FROM public.card_statements WHERE user_id = v_uid;
  DELETE FROM public.card_holders WHERE user_id = v_uid;
  DELETE FROM public.receipts WHERE user_id = v_uid;
  GET DIAGNOSTICS v_receipts = ROW_COUNT;
  DELETE FROM public.import_row_files WHERE user_id = v_uid;
  DELETE FROM public.import_files WHERE user_id = v_uid;
  GET DIAGNOSTICS v_files = ROW_COUNT;
  DELETE FROM public.import_rows WHERE user_id = v_uid;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  DELETE FROM public.import_batches WHERE user_id = v_uid;
  DELETE FROM public.import_preferences WHERE user_id = v_uid;
  DELETE FROM public.property_tasks WHERE user_id = v_uid;
  DELETE FROM public.property_credentials WHERE user_id = v_uid;
  DELETE FROM public.property_leases WHERE user_id = v_uid;
  DELETE FROM public.property_obligations WHERE user_id = v_uid;
  DELETE FROM public.properties WHERE user_id = v_uid;
  DELETE FROM public.cards WHERE user_id = v_uid;
  DELETE FROM public.accounts WHERE user_id = v_uid;
  DELETE FROM public.banks WHERE user_id = v_uid;
  DELETE FROM public.recipients WHERE user_id = v_uid;
  DELETE FROM public.categories WHERE user_id = v_uid;
  DELETE FROM public.financial_profiles WHERE user_id = v_uid;

  INSERT INTO public.audit_logs (user_id, action, entity, entity_id, new_value, note)
  VALUES (v_uid, 'reset_demo', 'user', v_uid,
          jsonb_build_object('receipts', v_receipts, 'rows', v_rows, 'files', v_files),
          'Reset dos dados de demonstração');

  RETURN QUERY SELECT v_receipts, v_rows, v_files, v_paths;
END; $$;

REVOKE ALL ON FUNCTION public.reset_demo_data_rpc() FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.reset_demo_data_rpc() TO authenticated;