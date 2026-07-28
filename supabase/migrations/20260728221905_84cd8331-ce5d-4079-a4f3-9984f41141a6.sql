-- 1. RPC atualizada: rejeita placeholder e persiste arquivo real
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
  v_file_path text;
BEGIN
  SELECT batch_id INTO v_row_batch_id FROM public.import_rows WHERE id = p_row_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Import row not found: %', p_row_id;
  END IF;

  v_file_path := nullif(trim(p_receipt_payload->>'file_path'), '');
  IF v_file_path IS NULL THEN
    RAISE EXCEPTION 'O comprovante confirmado não possui file_path.';
  END IF;
  IF v_file_path IN ('import/pending', 'pending') THEN
    RAISE EXCEPTION 'O comprovante confirmado possui um file_path inválido: %', v_file_path;
  END IF;

  INSERT INTO public.receipts (
    id, user_id, import_row_id, import_batch_id, profile_id, property_id,
    amount, payment_date, recipient_name, bank_name, description, notes,
    transaction_type, payment_method, category_id,
    file_path, file_name, file_mime, file_size, file_hash,
    ocr_data, ocr_status, status, approved_at, updated_at
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
    (p_receipt_payload->>'payment_method')::payment_method,
    (p_receipt_payload->>'category_id')::uuid,
    v_file_path,
    nullif(p_receipt_payload->>'file_name', ''),
    nullif(p_receipt_payload->>'file_mime', ''),
    nullif(p_receipt_payload->>'file_size', '')::bigint,
    nullif(p_receipt_payload->>'file_hash', ''),
    COALESCE(p_receipt_payload->'ocr_data', '{}'::jsonb),
    COALESCE(nullif(p_receipt_payload->>'ocr_status', '')::ocr_status, 'queued'::ocr_status),
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

  UPDATE public.import_rows
  SET review_status = 'approved', reviewed_at = now()
  WHERE id = p_row_id;

  RETURN v_receipt_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_import_row_rpc(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_import_row_rpc(uuid, jsonb) TO service_role;

-- 2. Reparo dos lançamentos já aprovados com caminho inválido.
-- Usa o arquivo do vínculo primário; quando duplicate_of estiver setado e
-- o registro atual não tiver dados, recorre ao arquivo original.
WITH candidates AS (
  SELECT
    r.id AS receipt_id,
    COALESCE(f.storage_path, orig.storage_path) AS storage_path,
    COALESCE(f.file_name,    orig.file_name)    AS file_name,
    COALESCE(f.mime_type,    orig.mime_type)    AS mime_type,
    COALESCE(f.size_bytes,   orig.size_bytes)   AS size_bytes,
    COALESCE(f.content_hash, orig.content_hash) AS content_hash,
    COALESCE(f.ocr_data,     orig.ocr_data)     AS ocr_data
  FROM public.receipts r
  JOIN public.import_row_files irf ON irf.row_id = r.import_row_id
  JOIN public.import_files f ON f.id = irf.file_id
  LEFT JOIN public.import_files orig ON orig.id = f.duplicate_of
  WHERE r.import_row_id IS NOT NULL
    AND irf.is_primary = true
    AND irf.confidence IN ('high','very_high','manual_confirmed')
    AND (
      r.file_path IS NULL
      OR btrim(r.file_path) = ''
      OR r.file_path IN ('import/pending','pending')
    )
)
UPDATE public.receipts r
SET
  file_path = c.storage_path,
  file_name = COALESCE(c.file_name, r.file_name),
  file_mime = COALESCE(c.mime_type, r.file_mime),
  file_size = COALESCE(c.size_bytes, r.file_size),
  file_hash = COALESCE(c.content_hash, r.file_hash),
  ocr_data  = COALESCE(c.ocr_data, r.ocr_data),
  updated_at = now()
FROM candidates c
WHERE c.receipt_id = r.id
  AND c.storage_path IS NOT NULL
  AND btrim(c.storage_path) <> ''
  AND c.storage_path NOT IN ('import/pending','pending');
