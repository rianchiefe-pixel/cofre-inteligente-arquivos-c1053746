ALTER TABLE public.receipts ALTER COLUMN file_path DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.approve_import_row_rpc(p_row_id uuid, p_overrides jsonb DEFAULT '{}'::jsonb)
 RETURNS TABLE(receipt_id uuid, row_review_status text, receipt_status text, file_path text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := public.require_permission('approveReceipts');
  v_row public.import_rows%ROWTYPE;
  v_batch public.import_batches%ROWTYPE;
  v_link public.import_row_files%ROWTYPE;
  v_file public.import_files%ROWTYPE;
  v_orig public.import_files%ROWTYPE;
  v_has_link boolean := false;
  v_path text;
  v_name text;
  v_mime text;
  v_size bigint;
  v_hash text;
  v_ocr jsonb := '{}'::jsonb;
  v_category_id uuid;
  v_property_id uuid;
  v_amount numeric;
  v_date date;
  v_type public.transaction_type;
  v_method public.payment_method;
  v_receipt_id uuid;
  v_allowed text[] := ARRAY['amount','transaction_date','payee','bank','description','notes','property_id','category_id','transaction_type','payment_method'];
  v_key text;
BEGIN
  IF p_overrides IS NULL OR jsonb_typeof(p_overrides) <> 'object' THEN
    RAISE EXCEPTION 'Overrides inválidos';
  END IF;
  FOR v_key IN SELECT jsonb_object_keys(p_overrides) LOOP
    IF NOT (v_key = ANY (v_allowed)) THEN
      RAISE EXCEPTION 'Campo não permitido na aprovação: %', v_key USING ERRCODE = '42501';
    END IF;
  END LOOP;

  SELECT * INTO v_row FROM public.import_rows
  WHERE id = p_row_id AND user_id = v_uid
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Linha de importação não encontrada' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_batch FROM public.import_batches
  WHERE id = v_row.batch_id AND user_id = v_uid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lote da importação não pertence ao usuário' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_link FROM public.import_row_files
  WHERE row_id = v_row.id AND user_id = v_uid AND is_primary
    AND confidence IN ('high','very_high','manual_confirmed')
  FOR UPDATE;
  v_has_link := FOUND;

  IF v_has_link THEN
    SELECT * INTO v_file FROM public.import_files
    WHERE id = v_link.file_id AND user_id = v_uid;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Arquivo do comprovante não pertence ao usuário' USING ERRCODE = '42501';
    END IF;

    IF v_file.duplicate_of IS NOT NULL THEN
      SELECT * INTO v_orig FROM public.import_files
      WHERE id = v_file.duplicate_of AND user_id = v_uid;
    END IF;

    v_path := nullif(btrim(COALESCE(v_file.storage_path, v_orig.storage_path, '')), '');
    IF v_path IS NULL OR v_path IN ('import/pending','pending') THEN
      RAISE EXCEPTION 'O comprovante confirmado não possui arquivo real no armazenamento.';
    END IF;
    v_name := COALESCE(v_file.file_name, v_orig.file_name);
    v_mime := COALESCE(v_file.mime_type, v_orig.mime_type);
    v_size := COALESCE(v_file.size_bytes, v_orig.size_bytes);
    v_hash := COALESCE(v_file.content_hash, v_orig.content_hash);
    v_ocr  := COALESCE(v_file.ocr_data, v_orig.ocr_data, '{}'::jsonb);
  END IF;

  -- Valores finais: override validado > linha
  v_amount := abs(COALESCE(nullif(p_overrides->>'amount','')::numeric, v_row.amount));
  IF v_amount IS NULL OR NOT (v_amount = v_amount) OR v_amount <= 0 THEN
    RAISE EXCEPTION 'Valor do lançamento inválido';
  END IF;

  v_date := COALESCE(nullif(p_overrides->>'transaction_date','')::date, v_row.transaction_date);
  IF v_date IS NULL THEN
    RAISE EXCEPTION 'Data do lançamento inválida';
  END IF;

  v_property_id := CASE WHEN p_overrides ? 'property_id'
                        THEN nullif(p_overrides->>'property_id','')::uuid
                        ELSE v_row.property_id END;
  IF v_property_id IS NOT NULL THEN
    PERFORM 1 FROM public.properties
    WHERE id = v_property_id AND user_id = v_uid
      AND (v_batch.profile_id IS NULL OR v_batch.scope_kind = 'general' OR profile_id = v_batch.profile_id);
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Imóvel inválido para este usuário/perfil' USING ERRCODE = '42501';
    END IF;
  END IF;

  v_category_id := nullif(p_overrides->>'category_id','')::uuid;
  IF v_category_id IS NOT NULL THEN
    PERFORM 1 FROM public.categories WHERE id = v_category_id AND user_id = v_uid;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Categoria inválida para este usuário' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF v_batch.profile_id IS NOT NULL THEN
    PERFORM 1 FROM public.financial_profiles WHERE id = v_batch.profile_id AND user_id = v_uid;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Perfil financeiro inválido' USING ERRCODE = '42501';
    END IF;
  END IF;

  v_type := COALESCE(
    nullif(lower(p_overrides->>'transaction_type'),'')::public.transaction_type,
    CASE WHEN upper(COALESCE(v_row.transaction_type,'')) = 'INVESTIMENTO'
         THEN 'investimento'::public.transaction_type
         ELSE 'despesa'::public.transaction_type END);

  BEGIN
    v_method := COALESCE(nullif(lower(p_overrides->>'payment_method'),''), nullif(lower(v_row.payment_method),''), 'outro')::public.payment_method;
  EXCEPTION WHEN others THEN
    v_method := 'outro'::public.payment_method;
  END;

  INSERT INTO public.receipts (
    user_id, import_row_id, import_batch_id, profile_id, property_id,
    amount, payment_date, recipient_name, bank_name, description, notes,
    transaction_type, payment_method, category_id,
    file_path, file_name, file_mime, file_size, file_hash,
    ocr_data, ocr_status, status, approved_at, updated_at
  ) VALUES (
    v_uid, v_row.id, v_row.batch_id, v_batch.profile_id, v_property_id,
    v_amount, v_date,
    COALESCE(nullif(p_overrides->>'payee',''), v_row.payee, v_row.description),
    COALESCE(nullif(p_overrides->>'bank',''), v_row.bank),
    COALESCE(nullif(p_overrides->>'description',''), v_row.description),
    COALESCE(nullif(p_overrides->>'notes',''), v_row.notes),
    v_type, v_method, v_category_id,
    v_path, v_name, v_mime, v_size, v_hash,
    v_ocr,
    CASE WHEN v_ocr <> '{}'::jsonb THEN 'done'::public.ocr_status ELSE 'queued'::public.ocr_status END,
    'approved'::public.receipt_status, now(), now()
  )
  ON CONFLICT (import_row_id) WHERE import_row_id IS NOT NULL DO UPDATE SET
    profile_id = EXCLUDED.profile_id,
    property_id = EXCLUDED.property_id,
    amount = EXCLUDED.amount,
    payment_date = EXCLUDED.payment_date,
    recipient_name = EXCLUDED.recipient_name,
    bank_name = EXCLUDED.bank_name,
    description = EXCLUDED.description,
    notes = EXCLUDED.notes,
    transaction_type = EXCLUDED.transaction_type,
    payment_method = EXCLUDED.payment_method,
    category_id = EXCLUDED.category_id,
    file_path = COALESCE(EXCLUDED.file_path, public.receipts.file_path),
    file_name = COALESCE(EXCLUDED.file_name, public.receipts.file_name),
    file_mime = COALESCE(EXCLUDED.file_mime, public.receipts.file_mime),
    file_size = COALESCE(EXCLUDED.file_size, public.receipts.file_size),
    file_hash = COALESCE(EXCLUDED.file_hash, public.receipts.file_hash),
    ocr_data = EXCLUDED.ocr_data,
    ocr_status = EXCLUDED.ocr_status,
    status = 'approved'::public.receipt_status,
    approved_at = now(),
    updated_at = now()
  RETURNING id INTO v_receipt_id;

  UPDATE public.import_rows
  SET review_status = 'approved', reviewed_at = now()
  WHERE id = v_row.id AND user_id = v_uid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Falha ao marcar a linha como aprovada';
  END IF;

  INSERT INTO public.audit_logs (user_id, action, entity, entity_id, new_value, note)
  VALUES (v_uid, 'approved', 'import_row', v_row.id,
          jsonb_build_object('receipt_id', v_receipt_id, 'file_path', v_path, 'amount', v_amount, 'has_receipt_file', v_has_link),
          'Aprovação de linha importada');

  RETURN QUERY
  SELECT r.id, ir.review_status, r.status::text, r.file_path
  FROM public.receipts r JOIN public.import_rows ir ON ir.id = r.import_row_id
  WHERE r.id = v_receipt_id;
END; $function$;