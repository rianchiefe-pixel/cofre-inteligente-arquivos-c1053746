-- =========================================================================
-- FASE 1 + 2 — Segurança, autorização por cargo e RPCs transacionais
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1. Matriz de permissões no servidor
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.role_permissions(_role public.app_role)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE _role
    WHEN 'proprietario' THEN ARRAY['manageUsers','viewAudit','exportReports','approveReceipts','bulkActions','deleteData','manageEntities','uploadReceipts','editReceipts','importData','viewAll','viewCredentials']
    WHEN 'administrador' THEN ARRAY['viewAudit','exportReports','approveReceipts','bulkActions','deleteData','manageEntities','uploadReceipts','editReceipts','importData','viewAll','viewCredentials']
    WHEN 'contador' THEN ARRAY['viewAudit','exportReports','editReceipts','importData','viewAll']
    WHEN 'colaborador' THEN ARRAY['uploadReceipts','editReceipts']
    WHEN 'visualizador' THEN ARRAY['viewAll']
    ELSE ARRAY[]::text[]
  END
$$;

CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _perm text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = _user_id
      AND _perm = ANY (public.role_permissions(ur.role))
  )
$$;

REVOKE ALL ON FUNCTION public.has_permission(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_permission(uuid, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.role_permissions(public.app_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.role_permissions(public.app_role) TO authenticated, service_role;

-- Guarda reutilizável: exige sessão + permissão, senão levanta exceção.
CREATE OR REPLACE FUNCTION public.require_permission(_perm text)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado' USING ERRCODE = '28000';
  END IF;
  IF NOT public.has_permission(v_uid, _perm) THEN
    RAISE EXCEPTION 'Permissão negada: %', _perm USING ERRCODE = '42501';
  END IF;
  RETURN v_uid;
END; $$;

REVOKE ALL ON FUNCTION public.require_permission(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.require_permission(text) TO authenticated, service_role;

-- -------------------------------------------------------------------------
-- 2. Integridade de vínculos de comprovante
-- -------------------------------------------------------------------------
-- Exatamente um arquivo principal por linha importada.
DELETE FROM public.import_row_files a
USING public.import_row_files b
WHERE a.row_id = b.row_id
  AND a.is_primary AND b.is_primary
  AND a.ctid < b.ctid;

CREATE UNIQUE INDEX IF NOT EXISTS import_row_files_one_primary_idx
  ON public.import_row_files (row_id)
  WHERE is_primary;

CREATE INDEX IF NOT EXISTS import_row_files_row_idx ON public.import_row_files (row_id);
CREATE INDEX IF NOT EXISTS receipts_import_row_idx ON public.receipts (import_row_id);

-- Um comprovante por linha importada (idempotência da aprovação).
CREATE UNIQUE INDEX IF NOT EXISTS receipts_import_row_unique_idx
  ON public.receipts (import_row_id)
  WHERE import_row_id IS NOT NULL;

-- Uma locação por imóvel.
DELETE FROM public.property_leases a
USING public.property_leases b
WHERE a.property_id = b.property_id
  AND a.ctid < b.ctid;

CREATE UNIQUE INDEX IF NOT EXISTS property_leases_property_unique_idx
  ON public.property_leases (property_id);

-- -------------------------------------------------------------------------
-- 3. Aprovação segura de linha importada
-- -------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.approve_import_row_rpc(uuid, jsonb);

CREATE OR REPLACE FUNCTION public.approve_import_row_rpc(
  p_row_id uuid,
  p_overrides jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE(receipt_id uuid, row_review_status text, receipt_status text, file_path text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := public.require_permission('approveReceipts');
  v_row public.import_rows%ROWTYPE;
  v_batch public.import_batches%ROWTYPE;
  v_link public.import_row_files%ROWTYPE;
  v_file public.import_files%ROWTYPE;
  v_orig public.import_files%ROWTYPE;
  v_path text;
  v_name text;
  v_mime text;
  v_size bigint;
  v_hash text;
  v_ocr jsonb;
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
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Confirme o comprovante principal antes de aprovar.';
  END IF;

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
    file_path = EXCLUDED.file_path,
    file_name = EXCLUDED.file_name,
    file_mime = EXCLUDED.file_mime,
    file_size = EXCLUDED.file_size,
    file_hash = EXCLUDED.file_hash,
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
          jsonb_build_object('receipt_id', v_receipt_id, 'file_path', v_path, 'amount', v_amount),
          'Aprovação de linha importada');

  RETURN QUERY
  SELECT r.id, ir.review_status, r.status::text, r.file_path
  FROM public.receipts r JOIN public.import_rows ir ON ir.id = r.import_row_id
  WHERE r.id = v_receipt_id;
END; $$;

REVOKE ALL ON FUNCTION public.approve_import_row_rpc(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_import_row_rpc(uuid, jsonb) TO authenticated;

-- -------------------------------------------------------------------------
-- 4. Máquina de estados da linha importada
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_import_row_review_rpc(
  p_row_id uuid,
  p_status text,
  p_reason text DEFAULT NULL
)
RETURNS TABLE(row_review_status text, receipt_status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_row public.import_rows%ROWTYPE;
  v_receipt public.receipts%ROWTYPE;
BEGIN
  IF p_status NOT IN ('pending','rejected','ver_depois') THEN
    RAISE EXCEPTION 'Status inválido: %', p_status;
  END IF;
  v_uid := public.require_permission(CASE WHEN p_status = 'rejected' THEN 'approveReceipts' ELSE 'editReceipts' END);

  SELECT * INTO v_row FROM public.import_rows
  WHERE id = p_row_id AND user_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Linha de importação não encontrada' USING ERRCODE = '42501';
  END IF;

  -- Coerência: nenhuma linha pendente/rejeitada pode manter comprovante aprovado.
  SELECT * INTO v_receipt FROM public.receipts
  WHERE import_row_id = v_row.id AND user_id = v_uid FOR UPDATE;
  IF FOUND AND v_receipt.status = 'approved' THEN
    UPDATE public.receipts
    SET status = CASE WHEN p_status = 'rejected' THEN 'rejected'::public.receipt_status
                      ELSE 'archived'::public.receipt_status END,
        approved_at = NULL,
        updated_at = now()
    WHERE id = v_receipt.id;

    INSERT INTO public.audit_logs (user_id, action, entity, entity_id, old_value, new_value, note)
    VALUES (v_uid, 'unapproved', 'receipt', v_receipt.id,
            jsonb_build_object('status','approved'),
            jsonb_build_object('status', CASE WHEN p_status='rejected' THEN 'rejected' ELSE 'archived' END),
            'Reversão por mudança de estado da linha importada');
  END IF;

  UPDATE public.import_rows
  SET review_status = p_status,
      reviewed_at = CASE WHEN p_status = 'pending' THEN NULL ELSE now() END,
      ai_error = COALESCE(p_reason, ai_error)
  WHERE id = v_row.id AND user_id = v_uid;

  RETURN QUERY
  SELECT ir.review_status,
         (SELECT r.status::text FROM public.receipts r WHERE r.import_row_id = ir.id)
  FROM public.import_rows ir WHERE ir.id = v_row.id;
END; $$;

REVOKE ALL ON FUNCTION public.set_import_row_review_rpc(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_import_row_review_rpc(uuid, text, text) TO authenticated;

-- -------------------------------------------------------------------------
-- 5. Vínculos de comprovante (anexar / desanexar / principal)
-- -------------------------------------------------------------------------
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

  INSERT INTO public.import_row_files (
    user_id, batch_id, row_id, file_id, score, confidence,
    match_reasons, is_manual, is_primary
  ) VALUES (
    v_uid, v_row.batch_id, v_row.id, p_file_id, 100, 'manual_confirmed',
    jsonb_build_array(jsonb_build_object('type','manual','detail','Vinculado manualmente')),
    true, p_make_primary
  )
  ON CONFLICT (row_id, file_id) DO UPDATE SET
    is_manual = true,
    is_primary = p_make_primary,
    confidence = 'manual_confirmed',
    match_reasons = jsonb_build_array(jsonb_build_object('type','manual','detail','Vinculado manualmente')),
    updated_at = now()
  RETURNING id INTO v_link_id;

  INSERT INTO public.audit_logs (user_id, action, entity, entity_id, new_value, note)
  VALUES (v_uid, 'linked', 'import_row_file', v_link_id,
          jsonb_build_object('row_id', v_row.id, 'file_id', p_file_id, 'is_primary', p_make_primary),
          'Vínculo manual de comprovante');

  RETURN QUERY SELECT irf.id, irf.is_primary, irf.confidence
  FROM public.import_row_files irf WHERE irf.id = v_link_id;
END; $$;

CREATE OR REPLACE FUNCTION public.detach_receipt_file_rpc(p_link_id uuid)
RETURNS TABLE(link_id uuid, confidence text, is_primary boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := public.require_permission('editReceipts');
  v_link public.import_row_files%ROWTYPE;
BEGIN
  SELECT * INTO v_link FROM public.import_row_files
  WHERE id = p_link_id AND user_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Vínculo não encontrado' USING ERRCODE='42501'; END IF;

  IF EXISTS (SELECT 1 FROM public.receipts r
             WHERE r.import_row_id = v_link.row_id AND r.status = 'approved') THEN
    RAISE EXCEPTION 'Desfaça a aprovação antes de desanexar o comprovante.';
  END IF;

  UPDATE public.import_row_files
  SET is_manual = true, is_primary = false, confidence = 'rejected',
      match_reasons = jsonb_build_array(jsonb_build_object('type','manual','detail','Rejeitado pelo usuário')),
      updated_at = now()
  WHERE id = v_link.id;

  INSERT INTO public.audit_logs (user_id, action, entity, entity_id, new_value, note)
  VALUES (v_uid, 'unlinked', 'import_row_file', v_link.id,
          jsonb_build_object('row_id', v_link.row_id, 'file_id', v_link.file_id),
          'Comprovante rejeitado manualmente');

  RETURN QUERY SELECT irf.id, irf.confidence, irf.is_primary
  FROM public.import_row_files irf WHERE irf.id = v_link.id;
END; $$;

CREATE OR REPLACE FUNCTION public.set_primary_receipt_file_rpc(p_link_id uuid)
RETURNS TABLE(link_id uuid, is_primary boolean, confidence text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := public.require_permission('editReceipts');
  v_link public.import_row_files%ROWTYPE;
BEGIN
  SELECT * INTO v_link FROM public.import_row_files
  WHERE id = p_link_id AND user_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Vínculo não encontrado' USING ERRCODE='42501'; END IF;
  IF v_link.confidence = 'rejected' THEN
    RAISE EXCEPTION 'Um vínculo rejeitado não pode ser definido como principal.';
  END IF;

  UPDATE public.import_row_files SET is_primary = false, updated_at = now()
  WHERE row_id = v_link.row_id AND user_id = v_uid AND id <> v_link.id AND is_primary;

  UPDATE public.import_row_files
  SET is_primary = true, is_manual = true, confidence = 'manual_confirmed', updated_at = now()
  WHERE id = v_link.id;

  INSERT INTO public.audit_logs (user_id, action, entity, entity_id, new_value, note)
  VALUES (v_uid, 'set_primary', 'import_row_file', v_link.id,
          jsonb_build_object('row_id', v_link.row_id, 'file_id', v_link.file_id),
          'Comprovante principal definido');

  RETURN QUERY SELECT irf.id, irf.is_primary, irf.confidence
  FROM public.import_row_files irf WHERE irf.id = v_link.id;
END; $$;

REVOKE ALL ON FUNCTION public.attach_receipt_file_rpc(uuid, uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.detach_receipt_file_rpc(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_primary_receipt_file_rpc(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.attach_receipt_file_rpc(uuid, uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.detach_receipt_file_rpc(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_primary_receipt_file_rpc(uuid) TO authenticated;

-- -------------------------------------------------------------------------
-- 6. Cartão + titulares em uma transação
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_card_with_holders_rpc(
  p_card jsonb,
  p_holders jsonb DEFAULT '[]'::jsonb
)
RETURNS TABLE(card_id uuid, holders_created integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := public.require_permission('manageEntities');
  v_profile_id uuid := nullif(p_card->>'profile_id','')::uuid;
  v_bank_id uuid := nullif(p_card->>'bank_id','')::uuid;
  v_closing smallint := nullif(p_card->>'closing_day','')::smallint;
  v_due smallint := nullif(p_card->>'due_day','')::smallint;
  v_last4 text := nullif(btrim(p_card->>'last4'),'');
  v_card_id uuid;
  v_count integer := 0;
  v_holder jsonb;
  v_allowed text[] := ARRAY['profile_id','bank_id','name','brand','last4','limit_amount','credit_limit','closing_day','due_day','holder'];
  v_key text;
BEGIN
  FOR v_key IN SELECT jsonb_object_keys(p_card) LOOP
    IF NOT (v_key = ANY (v_allowed)) THEN
      RAISE EXCEPTION 'Campo não permitido no cartão: %', v_key USING ERRCODE='42501';
    END IF;
  END LOOP;

  IF nullif(btrim(p_card->>'name'),'') IS NULL THEN
    RAISE EXCEPTION 'Nome do cartão é obrigatório';
  END IF;
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Perfil é obrigatório';
  END IF;
  PERFORM 1 FROM public.financial_profiles WHERE id = v_profile_id AND user_id = v_uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'Perfil inválido' USING ERRCODE='42501'; END IF;

  IF v_bank_id IS NOT NULL THEN
    PERFORM 1 FROM public.banks WHERE id = v_bank_id AND user_id = v_uid AND profile_id = v_profile_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Banco inválido para este perfil' USING ERRCODE='42501'; END IF;
  END IF;

  IF v_closing IS NOT NULL AND (v_closing < 1 OR v_closing > 31) THEN
    RAISE EXCEPTION 'Dia de fechamento deve estar entre 1 e 31';
  END IF;
  IF v_due IS NOT NULL AND (v_due < 1 OR v_due > 31) THEN
    RAISE EXCEPTION 'Dia de vencimento deve estar entre 1 e 31';
  END IF;
  IF v_last4 IS NOT NULL AND v_last4 !~ '^[0-9]{4}$' THEN
    RAISE EXCEPTION 'Os últimos quatro dígitos devem conter exatamente 4 números';
  END IF;

  INSERT INTO public.cards (user_id, profile_id, bank_id, name, brand, last4,
                            limit_amount, credit_limit, closing_day, due_day, holder)
  VALUES (v_uid, v_profile_id, v_bank_id, btrim(p_card->>'name'),
          nullif(p_card->>'brand','')::public.card_brand, v_last4,
          nullif(p_card->>'limit_amount','')::numeric,
          nullif(p_card->>'credit_limit','')::numeric,
          v_closing, v_due, nullif(btrim(p_card->>'holder'),''))
  RETURNING id INTO v_card_id;

  FOR v_holder IN SELECT * FROM jsonb_array_elements(COALESCE(p_holders,'[]'::jsonb)) LOOP
    IF nullif(btrim(v_holder->>'holder_name'),'') IS NULL THEN CONTINUE; END IF;
    IF nullif(v_holder->>'last4','') IS NOT NULL AND (v_holder->>'last4') !~ '^[0-9]{4}$' THEN
      RAISE EXCEPTION 'Final do cartão do titular inválido: %', v_holder->>'last4';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.card_holders
      WHERE card_id = v_card_id
        AND lower(holder_name) = lower(btrim(v_holder->>'holder_name'))
        AND COALESCE(last4,'') = COALESCE(nullif(v_holder->>'last4',''),'')
    ) THEN
      RAISE EXCEPTION 'Titular duplicado: %', v_holder->>'holder_name';
    END IF;
    INSERT INTO public.card_holders (card_id, user_id, holder_name, last4, is_primary)
    VALUES (v_card_id, v_uid, btrim(v_holder->>'holder_name'),
            nullif(v_holder->>'last4',''),
            COALESCE((v_holder->>'is_primary')::boolean, v_count = 0));
    v_count := v_count + 1;
  END LOOP;

  INSERT INTO public.audit_logs (user_id, action, entity, entity_id, new_value, note)
  VALUES (v_uid, 'created', 'card', v_card_id,
          jsonb_build_object('holders', v_count), 'Cartão criado com titulares');

  RETURN QUERY SELECT v_card_id, v_count;
END; $$;

REVOKE ALL ON FUNCTION public.create_card_with_holders_rpc(jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_card_with_holders_rpc(jsonb, jsonb) TO authenticated;

-- -------------------------------------------------------------------------
-- 7. Finalização de fatura em transação
-- -------------------------------------------------------------------------
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
  IF v_st.status = 'finalized' THEN
    RETURN QUERY SELECT v_st.id, v_st.status, 0, 0;
    RETURN;
  END IF;

  UPDATE public.card_transactions SET status = 'later', updated_at = now()
  WHERE statement_id = v_st.id AND user_id = v_uid AND status = 'pending';
  GET DIAGNOSTICS v_later = ROW_COUNT;

  SELECT count(*) INTO v_approved FROM public.card_transactions
  WHERE statement_id = v_st.id AND user_id = v_uid AND status = 'approved';

  UPDATE public.card_statements SET status = 'finalized', updated_at = now()
  WHERE id = v_st.id AND user_id = v_uid;

  INSERT INTO public.audit_logs (user_id, action, entity, entity_id, new_value, note)
  VALUES (v_uid, 'finalized', 'card_statement', v_st.id,
          jsonb_build_object('approved', v_approved, 'later', v_later), 'Fatura finalizada');

  RETURN QUERY SELECT v_st.id, 'finalized'::text, v_approved, v_later;
END; $$;

REVOKE ALL ON FUNCTION public.finalize_card_statement_rpc(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalize_card_statement_rpc(uuid) TO authenticated;

-- -------------------------------------------------------------------------
-- 8. Locação (upsert por imóvel)
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.upsert_property_lease_rpc(p_property_id uuid, p_lease jsonb)
RETURNS TABLE(lease_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := public.require_permission('manageEntities');
  v_id uuid;
  v_due integer := nullif(p_lease->>'due_day','')::integer;
  v_allowed text[] := ARRAY['tenant_name','tenant_phone','tenant_tax_id','rent_amount','due_day','contract_start','contract_end','notes'];
  v_key text;
BEGIN
  FOR v_key IN SELECT jsonb_object_keys(p_lease) LOOP
    IF NOT (v_key = ANY (v_allowed)) THEN
      RAISE EXCEPTION 'Campo não permitido na locação: %', v_key USING ERRCODE='42501';
    END IF;
  END LOOP;

  PERFORM 1 FROM public.properties WHERE id = p_property_id AND user_id = v_uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'Imóvel inválido' USING ERRCODE='42501'; END IF;
  IF v_due IS NOT NULL AND (v_due < 1 OR v_due > 31) THEN
    RAISE EXCEPTION 'Dia de vencimento deve estar entre 1 e 31';
  END IF;

  INSERT INTO public.property_leases (
    user_id, property_id, tenant_name, tenant_phone, tenant_tax_id,
    rent_amount, due_day, contract_start, contract_end, notes
  ) VALUES (
    v_uid, p_property_id,
    nullif(btrim(p_lease->>'tenant_name'),''),
    nullif(btrim(p_lease->>'tenant_phone'),''),
    nullif(btrim(p_lease->>'tenant_tax_id'),''),
    nullif(p_lease->>'rent_amount','')::numeric,
    v_due,
    nullif(p_lease->>'contract_start','')::date,
    nullif(p_lease->>'contract_end','')::date,
    nullif(btrim(p_lease->>'notes'),'')
  )
  ON CONFLICT (property_id) DO UPDATE SET
    tenant_name = EXCLUDED.tenant_name,
    tenant_phone = EXCLUDED.tenant_phone,
    tenant_tax_id = EXCLUDED.tenant_tax_id,
    rent_amount = EXCLUDED.rent_amount,
    due_day = EXCLUDED.due_day,
    contract_start = EXCLUDED.contract_start,
    contract_end = EXCLUDED.contract_end,
    notes = EXCLUDED.notes,
    updated_at = now()
  RETURNING id INTO v_id;

  RETURN QUERY SELECT v_id;
END; $$;

REVOKE ALL ON FUNCTION public.upsert_property_lease_rpc(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_property_lease_rpc(uuid, jsonb) TO authenticated;

-- -------------------------------------------------------------------------
-- 9. Reset de demonstração em transação
-- -------------------------------------------------------------------------
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

  INSERT INTO public.audit_logs (user_id, action, entity, entity_id, new_value, note)
  VALUES (v_uid, 'reset_demo', 'user', v_uid,
          jsonb_build_object('receipts', v_receipts, 'rows', v_rows, 'files', v_files),
          'Reset dos dados de demonstração');

  RETURN QUERY SELECT v_receipts, v_rows, v_files, v_paths;
END; $$;

REVOKE ALL ON FUNCTION public.reset_demo_data_rpc() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reset_demo_data_rpc() TO authenticated;

-- -------------------------------------------------------------------------
-- 10. Credenciais de imóveis: senha cifrada (reentrada obrigatória)
-- -------------------------------------------------------------------------
ALTER TABLE public.property_credentials
  ADD COLUMN IF NOT EXISTS password_cipher text,
  ADD COLUMN IF NOT EXISTS password_set_at timestamptz;

-- Remove qualquer senha em texto puro existente (usuário deverá redigitar).
UPDATE public.property_credentials SET password = NULL WHERE password IS NOT NULL;

-- -------------------------------------------------------------------------
-- 11. Concessão automática de cargo: apenas o primeiro cargo, sem escalonamento
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.grant_owner_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Só concede 'proprietario' quando o usuário ainda não possui nenhum cargo.
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = NEW.id) THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'proprietario')
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END; $$;