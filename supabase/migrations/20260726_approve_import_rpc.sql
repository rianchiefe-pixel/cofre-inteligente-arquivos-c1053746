CREATE OR REPLACE FUNCTION public.approve_import_row_rpc(
  p_row_id uuid,
  p_receipt_payload jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_receipt_id uuid;
  v_row_batch_id uuid;
BEGIN
  -- 1. Verifica se a linha existe
  SELECT batch_id INTO v_row_batch_id FROM public.import_rows WHERE id = p_row_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Import row not found: %', p_row_id;
  END IF;

  -- 2. Upsert idempotente no receipt
  INSERT INTO public.receipts (
    id,
    user_id,
    import_row_id,
    import_batch_id,
    profile_id,
    property_id,
    amount,
    payment_date,
    recipient_name,
    bank_name,
    description,
    notes,
    transaction_type,
    payment_method,
    category_id,
    file_path,
    file_name,
    file_mime,
    file_size,
    file_hash,
    ocr_data,
    ocr_status,
    status,
    approved_at,
    updated_at
  )
  SELECT
    COALESCE((SELECT id FROM public.receipts WHERE import_row_id = p_row_id), gen_random_uuid()),
    (p_receipt_payload->>'user_id')::uuid,
    p_row_id,
    (p_receipt_payload->>'import_batch_id')::uuid,
    (p_receipt_payload->>'profile_id')::uuid,
    (p_receipt_payload->>'property_id')::uuid,
    (p_receipt_payload->>'amount')::numeric,
    (p_receipt_payload->>'payment_date')::date,
    p_receipt_payload->>'recipient_name',
    p_receipt_payload->>'bank_name',
    p_receipt_payload->>'description',
    p_receipt_payload->>'notes',
    (p_receipt_payload->>'transaction_type')::transaction_type,
    (p_receipt_payload->>'payment_method')::payment_method_type,
    (p_receipt_payload->>'category_id')::uuid,
    p_receipt_payload->>'file_path',
    p_receipt_payload->>'file_name',
    p_receipt_payload->>'file_mime',
    (p_receipt_payload->>'file_size')::bigint,
    p_receipt_payload->>'file_hash',
    p_receipt_payload->'ocr_data',
    p_receipt_payload->>'ocr_status',
    'approved',
    now(),
    now()
  ON CONFLICT (import_row_id) DO UPDATE SET
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
    file_path = EXCLUDED.file_path,
    file_name = EXCLUDED.file_name,
    file_mime = EXCLUDED.file_mime,
    file_size = EXCLUDED.file_size,
    file_hash = EXCLUDED.file_hash,
    ocr_data = EXCLUDED.ocr_data,
    ocr_status = EXCLUDED.ocr_status,
    status = 'approved',
    approved_at = now(),
    updated_at = now()
  RETURNING id INTO v_receipt_id;

  -- 3. Marca a linha como aprovada
  UPDATE public.import_rows
  SET 
    review_status = 'approved',
    reviewed_at = now(),
    updated_at = now()
  WHERE id = p_row_id;

  RETURN v_receipt_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_import_row_rpc(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_import_row_rpc(uuid, jsonb) TO service_role;
