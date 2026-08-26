BEGIN;

ALTER TABLE public.property_credentials
  ALTER COLUMN property_id DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.upsert_property_credential_rpc(
  p_id uuid,
  p_property_id uuid,
  p_credential jsonb,
  p_password_cipher text,
  p_password_changed boolean
)
RETURNS TABLE(credential_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := public.require_permission('manageEntities');
  v_old public.property_credentials%ROWTYPE;
  v_service text := nullif(btrim(coalesce(p_credential->>'service','')),'');
  v_id uuid;
BEGIN
  IF v_service IS NULL THEN
    RAISE EXCEPTION 'Serviço é obrigatório' USING ERRCODE='22023';
  END IF;

  -- Imóvel é opcional.
  -- Se houver imóvel, valida a propriedade.
  IF p_property_id IS NOT NULL THEN
    PERFORM 1
    FROM public.properties
    WHERE id = p_property_id
      AND user_id = v_uid;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Imóvel inválido' USING ERRCODE='42501';
    END IF;
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.property_credentials
      (
        user_id,
        property_id,
        service,
        website,
        access_link,
        login,
        recovery_email,
        notes,
        password,
        password_cipher,
        password_set_at
      )
    VALUES
      (
        v_uid,
        p_property_id,
        v_service,
        nullif(p_credential->>'website',''),
        nullif(p_credential->>'access_link',''),
        nullif(p_credential->>'login',''),
        nullif(p_credential->>'recovery_email',''),
        nullif(p_credential->>'notes',''),
        NULL,
        nullif(p_password_cipher,''),
        CASE
          WHEN nullif(p_password_cipher,'') IS NULL THEN NULL
          ELSE now()
        END
      )
    RETURNING id INTO v_id;

  ELSE
    SELECT *
    INTO v_old
    FROM public.property_credentials
    WHERE id = p_id
      AND user_id = v_uid
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Credencial não encontrada' USING ERRCODE='42501';
    END IF;

    UPDATE public.property_credentials
    SET
      property_id = p_property_id,
      service = v_service,
      website = nullif(p_credential->>'website',''),
      access_link = nullif(p_credential->>'access_link',''),
      login = nullif(p_credential->>'login',''),
      recovery_email = nullif(p_credential->>'recovery_email',''),
      notes = nullif(p_credential->>'notes',''),
      password = CASE
        WHEN p_password_changed THEN NULL
        ELSE password
      END,
      password_cipher = CASE
        WHEN p_password_changed THEN nullif(p_password_cipher,'')
        ELSE password_cipher
      END,
      password_set_at = CASE
        WHEN p_password_changed
          AND nullif(p_password_cipher,'') IS NOT NULL THEN now()
        WHEN p_password_changed THEN NULL
        ELSE password_set_at
      END
    WHERE id = p_id
      AND user_id = v_uid
    RETURNING id INTO v_id;

    IF v_id IS NULL THEN
      RAISE EXCEPTION 'Nenhuma linha atualizada' USING ERRCODE='42501';
    END IF;
  END IF;

  INSERT INTO public.audit_logs
    (
      user_id,
      action,
      entity,
      entity_id,
      property_id,
      new_value
    )
  VALUES
    (
      v_uid,
      CASE WHEN p_id IS NULL THEN 'create' ELSE 'update' END,
      'property_credentials',
      v_id,
      p_property_id,
      jsonb_build_object(
        'service', v_service,
        'password_changed', coalesce(p_password_changed,false)
      )
    );

  RETURN QUERY SELECT v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_property_credential_rpc(
  uuid, uuid, jsonb, text, boolean
) FROM public;

GRANT EXECUTE ON FUNCTION public.upsert_property_credential_rpc(
  uuid, uuid, jsonb, text, boolean
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.upsert_property_credential_rpc(
  uuid, uuid, jsonb, text, boolean
) TO service_role;

COMMIT;