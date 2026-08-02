CREATE TABLE public.cost_centers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.financial_profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  notes text,
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cost_centers TO authenticated;
GRANT ALL ON public.cost_centers TO service_role;
ALTER TABLE public.cost_centers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own cost centers" ON public.cost_centers
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE UNIQUE INDEX cost_centers_unique_name ON public.cost_centers (user_id, profile_id, lower(btrim(name)));
CREATE TRIGGER cost_centers_touch BEFORE UPDATE ON public.cost_centers
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.receipts ADD COLUMN cost_center_id uuid REFERENCES public.cost_centers(id) ON DELETE SET NULL;
ALTER TABLE public.properties ADD COLUMN cost_center_id uuid REFERENCES public.cost_centers(id) ON DELETE SET NULL;
CREATE INDEX receipts_cost_center_idx ON public.receipts (cost_center_id);

CREATE TABLE public.classification_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.financial_profiles(id) ON DELETE CASCADE,
  cost_center_id uuid REFERENCES public.cost_centers(id) ON DELETE SET NULL,
  category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  property_id uuid REFERENCES public.properties(id) ON DELETE SET NULL,
  name text NOT NULL,
  terms text[] NOT NULL DEFAULT '{}',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.classification_rules TO authenticated;
GRANT ALL ON public.classification_rules TO service_role;
ALTER TABLE public.classification_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own classification rules" ON public.classification_rules
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE UNIQUE INDEX classification_rules_unique_name ON public.classification_rules (user_id, profile_id, lower(btrim(name)));
CREATE TRIGGER classification_rules_touch BEFORE UPDATE ON public.classification_rules
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.ensure_cost_center_rpc(p_profile_id uuid, p_name text)
RETURNS TABLE(cost_center_id uuid, created boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := public.require_permission('manageEntities');
  v_name text := nullif(btrim(p_name), '');
  v_id uuid;
BEGIN
  IF v_name IS NULL THEN RAISE EXCEPTION 'Nome do centro de custo é obrigatório'; END IF;
  PERFORM 1 FROM public.financial_profiles WHERE id = p_profile_id AND user_id = v_uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'Perfil inválido' USING ERRCODE = '42501'; END IF;

  SELECT id INTO v_id FROM public.cost_centers
  WHERE user_id = v_uid AND profile_id = p_profile_id
    AND (lower(btrim(name)) = lower(v_name)
      OR lower(btrim(name)) LIKE '%' || lower(v_name) || '%'
      OR lower(v_name) LIKE '%' || lower(btrim(name)) || '%')
  ORDER BY (lower(btrim(name)) = lower(v_name)) DESC, created_at
  LIMIT 1;

  IF v_id IS NOT NULL THEN
    RETURN QUERY SELECT v_id, false;
    RETURN;
  END IF;

  INSERT INTO public.cost_centers (user_id, profile_id, name)
  VALUES (v_uid, p_profile_id, v_name)
  RETURNING id INTO v_id;

  INSERT INTO public.audit_logs (user_id, action, entity, entity_id, profile_id, new_value, note)
  VALUES (v_uid, 'created', 'cost_center', v_id, p_profile_id,
          jsonb_build_object('name', v_name), 'Centro de custo criado');

  RETURN QUERY SELECT v_id, true;
END; $$;

CREATE OR REPLACE FUNCTION public.apply_holding_organization_rpc(p_profile_id uuid, p_run_id uuid, p_items jsonb)
RETURNS TABLE(receipt_id uuid, applied boolean, reason text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := public.require_permission('editReceipts');
  v_item jsonb;
  v_rid uuid;
  v_cat uuid;
  v_cc uuid;
  v_prop uuid;
  v_override boolean;
  v_old public.receipts%ROWTYPE;
  v_new_cat uuid;
  v_new_cc uuid;
  v_new_prop uuid;
BEGIN
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'Itens inválidos';
  END IF;
  IF p_run_id IS NULL THEN RAISE EXCEPTION 'Identificador da execução é obrigatório'; END IF;
  PERFORM 1 FROM public.financial_profiles WHERE id = p_profile_id AND user_id = v_uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'Perfil inválido' USING ERRCODE = '42501'; END IF;

  CREATE TEMP TABLE _out (receipt_id uuid, applied boolean, reason text) ON COMMIT DROP;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_rid := nullif(v_item->>'receipt_id','')::uuid;
    v_cat := nullif(v_item->>'category_id','')::uuid;
    v_cc := nullif(v_item->>'cost_center_id','')::uuid;
    v_prop := nullif(v_item->>'property_id','')::uuid;
    v_override := COALESCE((v_item->>'override')::boolean, false);

    IF v_rid IS NULL THEN CONTINUE; END IF;

    SELECT * INTO v_old FROM public.receipts
    WHERE id = v_rid AND user_id = v_uid FOR UPDATE;
    IF NOT FOUND THEN
      INSERT INTO _out VALUES (v_rid, false, 'Lançamento não encontrado');
      CONTINUE;
    END IF;
    IF v_old.profile_id IS DISTINCT FROM p_profile_id THEN
      INSERT INTO _out VALUES (v_rid, false, 'Lançamento pertence a outro perfil');
      CONTINUE;
    END IF;

    IF v_cat IS NOT NULL THEN
      PERFORM 1 FROM public.categories WHERE id = v_cat AND user_id = v_uid;
      IF NOT FOUND THEN
        INSERT INTO _out VALUES (v_rid, false, 'Categoria inválida');
        CONTINUE;
      END IF;
    END IF;
    IF v_cc IS NOT NULL THEN
      PERFORM 1 FROM public.cost_centers WHERE id = v_cc AND user_id = v_uid AND profile_id = p_profile_id;
      IF NOT FOUND THEN
        INSERT INTO _out VALUES (v_rid, false, 'Centro de custo inválido para o perfil');
        CONTINUE;
      END IF;
    END IF;
    IF v_prop IS NOT NULL THEN
      PERFORM 1 FROM public.properties WHERE id = v_prop AND user_id = v_uid AND (profile_id IS NULL OR profile_id = p_profile_id);
      IF NOT FOUND THEN
        INSERT INTO _out VALUES (v_rid, false, 'Imóvel inválido para o perfil');
        CONTINUE;
      END IF;
    END IF;

    v_new_cat := CASE WHEN v_cat IS NULL THEN v_old.category_id
                      WHEN v_old.category_id IS NULL OR v_override THEN v_cat
                      ELSE v_old.category_id END;
    v_new_prop := CASE WHEN v_prop IS NULL THEN v_old.property_id
                       WHEN v_old.property_id IS NULL OR v_override THEN v_prop
                       ELSE v_old.property_id END;
    v_new_cc := COALESCE(v_cc, v_old.cost_center_id);

    IF v_new_cat IS NOT DISTINCT FROM v_old.category_id
       AND v_new_prop IS NOT DISTINCT FROM v_old.property_id
       AND v_new_cc IS NOT DISTINCT FROM v_old.cost_center_id THEN
      INSERT INTO _out VALUES (v_rid, false, 'Nada a alterar');
      CONTINUE;
    END IF;

    UPDATE public.receipts
    SET category_id = v_new_cat,
        property_id = v_new_prop,
        cost_center_id = v_new_cc,
        updated_at = now()
    WHERE id = v_rid AND user_id = v_uid AND profile_id = p_profile_id;

    INSERT INTO public.audit_logs (user_id, action, entity, entity_id, profile_id, property_id, old_value, new_value, note)
    VALUES (v_uid, 'organized', 'receipt', v_rid, p_profile_id, v_new_prop,
            jsonb_build_object('profile_id', v_old.profile_id, 'category_id', v_old.category_id,
                               'property_id', v_old.property_id, 'cost_center_id', v_old.cost_center_id),
            jsonb_build_object('run_id', p_run_id, 'profile_id', p_profile_id, 'category_id', v_new_cat,
                               'property_id', v_new_prop, 'cost_center_id', v_new_cc,
                               'confidence', v_item->>'confidence', 'rule', v_item->>'rule',
                               'match_reason', v_item->>'reason'),
            'Organização de lançamentos');

    INSERT INTO _out VALUES (v_rid, true, COALESCE(v_item->>'reason', 'Classificado'));
  END LOOP;

  RETURN QUERY SELECT o.receipt_id, o.applied, o.reason FROM _out o;
END; $$;

CREATE OR REPLACE FUNCTION public.undo_holding_organization_rpc(p_run_id uuid)
RETURNS TABLE(reverted integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := public.require_permission('editReceipts');
  v_log record;
  v_count integer := 0;
BEGIN
  IF p_run_id IS NULL THEN RAISE EXCEPTION 'Identificador da execução é obrigatório'; END IF;

  FOR v_log IN
    SELECT * FROM public.audit_logs
    WHERE user_id = v_uid AND action = 'organized' AND entity = 'receipt'
      AND new_value->>'run_id' = p_run_id::text
    ORDER BY created_at DESC
  LOOP
    UPDATE public.receipts
    SET category_id = nullif(v_log.old_value->>'category_id','')::uuid,
        property_id = nullif(v_log.old_value->>'property_id','')::uuid,
        cost_center_id = nullif(v_log.old_value->>'cost_center_id','')::uuid,
        updated_at = now()
    WHERE id = v_log.entity_id AND user_id = v_uid
      AND profile_id::text = v_log.new_value->>'profile_id';
    IF FOUND THEN
      v_count := v_count + 1;
      INSERT INTO public.audit_logs (user_id, action, entity, entity_id, profile_id, old_value, new_value, note)
      VALUES (v_uid, 'organize_undo', 'receipt', v_log.entity_id, v_log.profile_id,
              v_log.new_value, v_log.old_value, 'Organização desfeita');
    END IF;
  END LOOP;

  RETURN QUERY SELECT v_count;
END; $$;