-- ============ Fase 7: CRUD seguro (bancos, contas, categorias) ============

CREATE OR REPLACE FUNCTION public.upsert_bank_rpc(p_id uuid, p_bank jsonb)
RETURNS TABLE(bank_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := public.require_permission('manageEntities');
  v_old public.banks%ROWTYPE;
  v_profile uuid := nullif(p_bank->>'profile_id','')::uuid;
  v_name text := nullif(btrim(coalesce(p_bank->>'name','')),'');
  v_color text := nullif(p_bank->>'color','');
  v_notes text := nullif(p_bank->>'notes','');
  v_id uuid;
BEGIN
  IF v_name IS NULL THEN RAISE EXCEPTION 'Nome do banco é obrigatório' USING ERRCODE='22023'; END IF;
  IF v_profile IS NULL THEN RAISE EXCEPTION 'Perfil é obrigatório' USING ERRCODE='22023'; END IF;
  PERFORM 1 FROM public.financial_profiles WHERE id = v_profile AND user_id = v_uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'Perfil inválido' USING ERRCODE='42501'; END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.banks (user_id, profile_id, name, color, notes)
    VALUES (v_uid, v_profile, v_name, v_color, v_notes)
    RETURNING id INTO v_id;
    INSERT INTO public.audit_logs (user_id, action, entity, entity_id, profile_id, new_value)
    VALUES (v_uid, 'create', 'banks', v_id, v_profile, jsonb_build_object('name', v_name));
  ELSE
    SELECT * INTO v_old FROM public.banks WHERE id = p_id AND user_id = v_uid FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Banco não encontrado' USING ERRCODE='42501'; END IF;
    UPDATE public.banks SET profile_id = v_profile, name = v_name, color = v_color, notes = v_notes
    WHERE id = p_id AND user_id = v_uid RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Nenhuma linha atualizada' USING ERRCODE='42501'; END IF;
    INSERT INTO public.audit_logs (user_id, action, entity, entity_id, profile_id, old_value, new_value)
    VALUES (v_uid, 'update', 'banks', v_id, v_profile,
            jsonb_build_object('name', v_old.name, 'profile_id', v_old.profile_id),
            jsonb_build_object('name', v_name, 'profile_id', v_profile));
  END IF;
  RETURN QUERY SELECT v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.delete_bank_rpc(p_id uuid, p_reassign_to uuid)
RETURNS TABLE(deleted_id uuid, reassigned_accounts integer, reassigned_cards integer, reassigned_receipts integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := public.require_permission('deleteData');
  v_old public.banks%ROWTYPE;
  v_acc integer := 0; v_card integer := 0; v_rec integer := 0;
  v_refs integer := 0;
BEGIN
  SELECT * INTO v_old FROM public.banks WHERE id = p_id AND user_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Banco não encontrado' USING ERRCODE='42501'; END IF;

  IF p_reassign_to IS NOT NULL THEN
    IF p_reassign_to = p_id THEN RAISE EXCEPTION 'Destino inválido' USING ERRCODE='22023'; END IF;
    PERFORM 1 FROM public.banks WHERE id = p_reassign_to AND user_id = v_uid;
    IF NOT FOUND THEN RAISE EXCEPTION 'Banco de destino inválido' USING ERRCODE='42501'; END IF;
    WITH u AS (UPDATE public.accounts SET bank_id = p_reassign_to WHERE bank_id = p_id AND user_id = v_uid RETURNING 1)
      SELECT count(*) INTO v_acc FROM u;
    WITH u AS (UPDATE public.cards SET bank_id = p_reassign_to WHERE bank_id = p_id AND user_id = v_uid RETURNING 1)
      SELECT count(*) INTO v_card FROM u;
    WITH u AS (UPDATE public.receipts SET bank_id = p_reassign_to WHERE bank_id = p_id AND user_id = v_uid RETURNING 1)
      SELECT count(*) INTO v_rec FROM u;
  ELSE
    SELECT (SELECT count(*) FROM public.accounts WHERE bank_id = p_id AND user_id = v_uid)
         + (SELECT count(*) FROM public.cards WHERE bank_id = p_id AND user_id = v_uid)
         + (SELECT count(*) FROM public.receipts WHERE bank_id = p_id AND user_id = v_uid)
      INTO v_refs;
    IF v_refs > 0 THEN
      RAISE EXCEPTION 'Banco possui % registros vinculados. Reatribua antes de excluir.', v_refs USING ERRCODE='23503';
    END IF;
  END IF;

  DELETE FROM public.banks WHERE id = p_id AND user_id = v_uid;
  INSERT INTO public.audit_logs (user_id, action, entity, entity_id, profile_id, old_value, note)
  VALUES (v_uid, 'delete', 'banks', p_id, v_old.profile_id, to_jsonb(v_old),
          CASE WHEN p_reassign_to IS NULL THEN NULL ELSE 'reatribuído para ' || p_reassign_to::text END);

  RETURN QUERY SELECT p_id, v_acc, v_card, v_rec;
END; $$;

CREATE OR REPLACE FUNCTION public.upsert_account_rpc(p_id uuid, p_account jsonb)
RETURNS TABLE(account_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := public.require_permission('manageEntities');
  v_old public.accounts%ROWTYPE;
  v_profile uuid := nullif(p_account->>'profile_id','')::uuid;
  v_bank uuid := nullif(p_account->>'bank_id','')::uuid;
  v_nick text := nullif(btrim(coalesce(p_account->>'nickname','')),'');
  v_type public.account_type := coalesce(nullif(p_account->>'type',''), 'outro')::public.account_type;
  v_id uuid;
BEGIN
  IF v_nick IS NULL THEN RAISE EXCEPTION 'Apelido é obrigatório' USING ERRCODE='22023'; END IF;
  IF v_profile IS NULL THEN RAISE EXCEPTION 'Perfil é obrigatório' USING ERRCODE='22023'; END IF;
  PERFORM 1 FROM public.financial_profiles WHERE id = v_profile AND user_id = v_uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'Perfil inválido' USING ERRCODE='42501'; END IF;
  IF v_bank IS NOT NULL THEN
    PERFORM 1 FROM public.banks WHERE id = v_bank AND user_id = v_uid AND profile_id = v_profile;
    IF NOT FOUND THEN RAISE EXCEPTION 'Banco inválido para este perfil' USING ERRCODE='42501'; END IF;
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.accounts (user_id, profile_id, bank_id, nickname, type, holder, agency, number, color, notes, initial_balance)
    VALUES (v_uid, v_profile, v_bank, v_nick, v_type,
            nullif(p_account->>'holder',''), nullif(p_account->>'agency',''), nullif(p_account->>'number',''),
            nullif(p_account->>'color',''), nullif(p_account->>'notes',''),
            nullif(p_account->>'initial_balance','')::numeric)
    RETURNING id INTO v_id;
    INSERT INTO public.audit_logs (user_id, action, entity, entity_id, profile_id, new_value)
    VALUES (v_uid, 'create', 'accounts', v_id, v_profile, jsonb_build_object('nickname', v_nick));
  ELSE
    SELECT * INTO v_old FROM public.accounts WHERE id = p_id AND user_id = v_uid FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Conta não encontrada' USING ERRCODE='42501'; END IF;
    UPDATE public.accounts SET
      profile_id = v_profile, bank_id = v_bank, nickname = v_nick, type = v_type,
      holder = nullif(p_account->>'holder',''), agency = nullif(p_account->>'agency',''),
      number = nullif(p_account->>'number',''), color = nullif(p_account->>'color',''),
      notes = nullif(p_account->>'notes',''),
      initial_balance = nullif(p_account->>'initial_balance','')::numeric
    WHERE id = p_id AND user_id = v_uid RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Nenhuma linha atualizada' USING ERRCODE='42501'; END IF;
    INSERT INTO public.audit_logs (user_id, action, entity, entity_id, profile_id, old_value, new_value)
    VALUES (v_uid, 'update', 'accounts', v_id, v_profile, to_jsonb(v_old), jsonb_build_object('nickname', v_nick, 'type', v_type));
  END IF;
  RETURN QUERY SELECT v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.delete_account_rpc(p_id uuid, p_reassign_to uuid)
RETURNS TABLE(deleted_id uuid, reassigned_receipts integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := public.require_permission('deleteData');
  v_old public.accounts%ROWTYPE;
  v_rec integer := 0;
  v_refs integer := 0;
BEGIN
  SELECT * INTO v_old FROM public.accounts WHERE id = p_id AND user_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Conta não encontrada' USING ERRCODE='42501'; END IF;

  IF p_reassign_to IS NOT NULL THEN
    IF p_reassign_to = p_id THEN RAISE EXCEPTION 'Destino inválido' USING ERRCODE='22023'; END IF;
    PERFORM 1 FROM public.accounts WHERE id = p_reassign_to AND user_id = v_uid;
    IF NOT FOUND THEN RAISE EXCEPTION 'Conta de destino inválida' USING ERRCODE='42501'; END IF;
    WITH u AS (UPDATE public.receipts SET account_id = p_reassign_to WHERE account_id = p_id AND user_id = v_uid RETURNING 1)
      SELECT count(*) INTO v_rec FROM u;
  ELSE
    SELECT count(*) INTO v_refs FROM public.receipts WHERE account_id = p_id AND user_id = v_uid;
    IF v_refs > 0 THEN
      RAISE EXCEPTION 'Conta possui % comprovantes vinculados. Reatribua antes de excluir.', v_refs USING ERRCODE='23503';
    END IF;
  END IF;

  DELETE FROM public.accounts WHERE id = p_id AND user_id = v_uid;
  INSERT INTO public.audit_logs (user_id, action, entity, entity_id, profile_id, old_value)
  VALUES (v_uid, 'delete', 'accounts', p_id, v_old.profile_id, to_jsonb(v_old));
  RETURN QUERY SELECT p_id, v_rec;
END; $$;

CREATE OR REPLACE FUNCTION public.upsert_category_rpc(p_id uuid, p_category jsonb)
RETURNS TABLE(category_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := public.require_permission('manageEntities');
  v_old public.categories%ROWTYPE;
  v_name text := nullif(btrim(coalesce(p_category->>'name','')),'');
  v_parent uuid := nullif(p_category->>'parent_id','')::uuid;
  v_archived boolean := coalesce((p_category->>'archived')::boolean, false);
  v_id uuid;
BEGIN
  IF v_name IS NULL THEN RAISE EXCEPTION 'Nome da categoria é obrigatório' USING ERRCODE='22023'; END IF;
  IF v_parent IS NOT NULL THEN
    IF v_parent = p_id THEN RAISE EXCEPTION 'Categoria não pode ser pai de si mesma' USING ERRCODE='22023'; END IF;
    PERFORM 1 FROM public.categories WHERE id = v_parent AND user_id = v_uid;
    IF NOT FOUND THEN RAISE EXCEPTION 'Categoria pai inválida' USING ERRCODE='42501'; END IF;
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.categories (user_id, name, parent_id, archived, color, default_type)
    VALUES (v_uid, v_name, v_parent, v_archived, nullif(p_category->>'color',''),
            nullif(p_category->>'default_type','')::public.transaction_type)
    RETURNING id INTO v_id;
    INSERT INTO public.audit_logs (user_id, action, entity, entity_id, new_value)
    VALUES (v_uid, 'create', 'categories', v_id, jsonb_build_object('name', v_name));
  ELSE
    SELECT * INTO v_old FROM public.categories WHERE id = p_id AND user_id = v_uid FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Categoria não encontrada' USING ERRCODE='42501'; END IF;
    UPDATE public.categories SET
      name = v_name, parent_id = v_parent, archived = v_archived,
      color = nullif(p_category->>'color',''),
      default_type = nullif(p_category->>'default_type','')::public.transaction_type
    WHERE id = p_id AND user_id = v_uid RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Nenhuma linha atualizada' USING ERRCODE='42501'; END IF;
    INSERT INTO public.audit_logs (user_id, action, entity, entity_id, old_value, new_value)
    VALUES (v_uid, 'update', 'categories', v_id, to_jsonb(v_old),
            jsonb_build_object('name', v_name, 'archived', v_archived, 'parent_id', v_parent));
  END IF;
  RETURN QUERY SELECT v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.delete_category_rpc(p_id uuid, p_reassign_to uuid)
RETURNS TABLE(deleted_id uuid, reassigned_receipts integer, orphaned_children integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := public.require_permission('deleteData');
  v_old public.categories%ROWTYPE;
  v_rec integer := 0; v_child integer := 0;
  v_refs integer := 0;
BEGIN
  SELECT * INTO v_old FROM public.categories WHERE id = p_id AND user_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Categoria não encontrada' USING ERRCODE='42501'; END IF;

  IF p_reassign_to IS NOT NULL THEN
    IF p_reassign_to = p_id THEN RAISE EXCEPTION 'Destino inválido' USING ERRCODE='22023'; END IF;
    PERFORM 1 FROM public.categories WHERE id = p_reassign_to AND user_id = v_uid;
    IF NOT FOUND THEN RAISE EXCEPTION 'Categoria de destino inválida' USING ERRCODE='42501'; END IF;
    WITH u AS (UPDATE public.receipts SET category_id = p_reassign_to WHERE category_id = p_id AND user_id = v_uid RETURNING 1)
      SELECT count(*) INTO v_rec FROM u;
    WITH u AS (UPDATE public.categories SET parent_id = p_reassign_to WHERE parent_id = p_id AND user_id = v_uid RETURNING 1)
      SELECT count(*) INTO v_child FROM u;
    UPDATE public.recipients SET default_category_id = p_reassign_to WHERE default_category_id = p_id AND user_id = v_uid;
  ELSE
    SELECT (SELECT count(*) FROM public.receipts WHERE category_id = p_id AND user_id = v_uid)
         + (SELECT count(*) FROM public.categories WHERE parent_id = p_id AND user_id = v_uid)
      INTO v_refs;
    IF v_refs > 0 THEN
      RAISE EXCEPTION 'Categoria possui % registros vinculados. Reatribua ou arquive.', v_refs USING ERRCODE='23503';
    END IF;
    UPDATE public.recipients SET default_category_id = NULL WHERE default_category_id = p_id AND user_id = v_uid;
  END IF;

  DELETE FROM public.categories WHERE id = p_id AND user_id = v_uid;
  INSERT INTO public.audit_logs (user_id, action, entity, entity_id, old_value)
  VALUES (v_uid, 'delete', 'categories', p_id, to_jsonb(v_old));
  RETURN QUERY SELECT p_id, v_rec, v_child;
END; $$;

-- ============ Fase 7: credenciais de imóveis ============

-- Senhas nunca podem sair em consultas gerais: remove SELECT das colunas sensíveis.
REVOKE SELECT ON public.property_credentials FROM authenticated;
GRANT SELECT (id, user_id, property_id, service, website, access_link, login,
              recovery_email, notes, password_set_at, created_at, updated_at)
  ON public.property_credentials TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.property_credentials TO authenticated;
GRANT ALL ON public.property_credentials TO service_role;

-- Grava/atualiza credencial. O cifrado é produzido no servidor da aplicação.
CREATE OR REPLACE FUNCTION public.upsert_property_credential_rpc(
  p_id uuid, p_property_id uuid, p_credential jsonb, p_password_cipher text, p_password_changed boolean
)
RETURNS TABLE(credential_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := public.require_permission('manageEntities');
  v_old public.property_credentials%ROWTYPE;
  v_service text := nullif(btrim(coalesce(p_credential->>'service','')),'');
  v_id uuid;
BEGIN
  IF v_service IS NULL THEN RAISE EXCEPTION 'Serviço é obrigatório' USING ERRCODE='22023'; END IF;
  PERFORM 1 FROM public.properties WHERE id = p_property_id AND user_id = v_uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'Imóvel inválido' USING ERRCODE='42501'; END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.property_credentials
      (user_id, property_id, service, website, access_link, login, recovery_email, notes,
       password, password_cipher, password_set_at)
    VALUES (v_uid, p_property_id, v_service,
       nullif(p_credential->>'website',''), nullif(p_credential->>'access_link',''),
       nullif(p_credential->>'login',''), nullif(p_credential->>'recovery_email',''),
       nullif(p_credential->>'notes',''),
       NULL, nullif(p_password_cipher,''),
       CASE WHEN nullif(p_password_cipher,'') IS NULL THEN NULL ELSE now() END)
    RETURNING id INTO v_id;
  ELSE
    SELECT * INTO v_old FROM public.property_credentials WHERE id = p_id AND user_id = v_uid FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Credencial não encontrada' USING ERRCODE='42501'; END IF;
    UPDATE public.property_credentials SET
      property_id = p_property_id, service = v_service,
      website = nullif(p_credential->>'website',''),
      access_link = nullif(p_credential->>'access_link',''),
      login = nullif(p_credential->>'login',''),
      recovery_email = nullif(p_credential->>'recovery_email',''),
      notes = nullif(p_credential->>'notes',''),
      password = CASE WHEN p_password_changed THEN NULL ELSE password END,
      password_cipher = CASE WHEN p_password_changed THEN nullif(p_password_cipher,'') ELSE password_cipher END,
      password_set_at = CASE WHEN p_password_changed AND nullif(p_password_cipher,'') IS NOT NULL THEN now()
                             WHEN p_password_changed THEN NULL ELSE password_set_at END
    WHERE id = p_id AND user_id = v_uid RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Nenhuma linha atualizada' USING ERRCODE='42501'; END IF;
  END IF;

  INSERT INTO public.audit_logs (user_id, action, entity, entity_id, property_id, new_value)
  VALUES (v_uid, CASE WHEN p_id IS NULL THEN 'create' ELSE 'update' END,
          'property_credentials', v_id, p_property_id,
          jsonb_build_object('service', v_service, 'password_changed', coalesce(p_password_changed,false)));
  RETURN QUERY SELECT v_id;
END; $$;

-- Revela o cifrado apenas sob ação explícita e registra auditoria.
CREATE OR REPLACE FUNCTION public.reveal_property_credential_rpc(p_id uuid)
RETURNS TABLE(credential_id uuid, password_cipher text, legacy_password text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := public.require_permission('viewAll');
  v_row public.property_credentials%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.property_credentials WHERE id = p_id AND user_id = v_uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'Credencial não encontrada' USING ERRCODE='42501'; END IF;

  INSERT INTO public.audit_logs (user_id, action, entity, entity_id, property_id, note)
  VALUES (v_uid, 'reveal', 'property_credentials', v_row.id, v_row.property_id, 'Senha visualizada');

  RETURN QUERY SELECT v_row.id, v_row.password_cipher, v_row.password;
END; $$;

REVOKE ALL ON FUNCTION public.upsert_bank_rpc(uuid, jsonb) FROM public;
REVOKE ALL ON FUNCTION public.delete_bank_rpc(uuid, uuid) FROM public;
REVOKE ALL ON FUNCTION public.upsert_account_rpc(uuid, jsonb) FROM public;
REVOKE ALL ON FUNCTION public.delete_account_rpc(uuid, uuid) FROM public;
REVOKE ALL ON FUNCTION public.upsert_category_rpc(uuid, jsonb) FROM public;
REVOKE ALL ON FUNCTION public.delete_category_rpc(uuid, uuid) FROM public;
REVOKE ALL ON FUNCTION public.upsert_property_credential_rpc(uuid, uuid, jsonb, text, boolean) FROM public;
REVOKE ALL ON FUNCTION public.reveal_property_credential_rpc(uuid) FROM public;

GRANT EXECUTE ON FUNCTION public.upsert_bank_rpc(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_bank_rpc(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_account_rpc(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_account_rpc(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_category_rpc(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_category_rpc(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_property_credential_rpc(uuid, uuid, jsonb, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reveal_property_credential_rpc(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_bank_rpc(uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_bank_rpc(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.upsert_account_rpc(uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_account_rpc(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.upsert_category_rpc(uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_category_rpc(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.upsert_property_credential_rpc(uuid, uuid, jsonb, text, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.reveal_property_credential_rpc(uuid) TO service_role;