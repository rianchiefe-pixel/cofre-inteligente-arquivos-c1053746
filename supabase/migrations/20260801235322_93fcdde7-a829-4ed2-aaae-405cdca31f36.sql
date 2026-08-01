CREATE OR REPLACE FUNCTION public.finalize_card_statement_rpc(p_statement_id uuid)
RETURNS TABLE(statement_id uuid, statement_status text, approved_count integer, later_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := public.require_permission('approveReceipts');
  v_st public.card_statements%ROWTYPE;
  v_later integer := 0;
  v_approved integer := 0;
BEGIN
  SELECT * INTO v_st FROM public.card_statements
  WHERE id = p_statement_id AND user_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Fatura não encontrada' USING ERRCODE='42501'; END IF;

  SELECT count(*) INTO v_approved FROM public.card_transactions
  WHERE statement_id = v_st.id AND user_id = v_uid AND status = 'approved';

  IF v_st.status = 'approved' THEN
    RETURN QUERY SELECT v_st.id, v_st.status, v_approved, 0;
    RETURN;
  END IF;

  UPDATE public.card_transactions SET status = 'later', updated_at = now()
  WHERE statement_id = v_st.id AND user_id = v_uid AND status = 'pending';
  GET DIAGNOSTICS v_later = ROW_COUNT;

  UPDATE public.card_statements SET status = 'approved', updated_at = now()
  WHERE id = v_st.id AND user_id = v_uid;

  INSERT INTO public.audit_logs (user_id, action, entity, entity_id, new_value, note)
  VALUES (v_uid, 'finalized', 'card_statement', v_st.id,
          jsonb_build_object('approved', v_approved, 'later', v_later), 'Fatura finalizada');

  RETURN QUERY SELECT v_st.id, 'approved'::text, v_approved, v_later;
END; $$;

REVOKE ALL ON FUNCTION public.finalize_card_statement_rpc(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalize_card_statement_rpc(uuid) TO authenticated;