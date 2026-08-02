-- 1) Idempotência: uma linha por (lote, número de linha)
CREATE UNIQUE INDEX IF NOT EXISTS import_rows_batch_row_unique_idx
  ON public.import_rows (batch_id, row_number);

-- 2) Arquivo canônico por hash -------------------------------------------------
-- Achata cadeias existentes: duplicata deve apontar para a raiz.
WITH RECURSIVE chain AS (
  SELECT f.id, f.duplicate_of AS parent, 0 AS depth
  FROM public.import_files f
  WHERE f.duplicate_of IS NOT NULL
  UNION ALL
  SELECT c.id, p.duplicate_of, c.depth + 1
  FROM chain c
  JOIN public.import_files p ON p.id = c.parent
  WHERE p.duplicate_of IS NOT NULL AND c.depth < 20
),
roots AS (
  SELECT DISTINCT ON (id) id, parent
  FROM chain
  ORDER BY id, depth DESC
)
UPDATE public.import_files f
SET duplicate_of = r.parent
FROM roots r
WHERE f.id = r.id AND r.parent IS NOT NULL AND r.parent <> f.id
  AND f.duplicate_of IS DISTINCT FROM r.parent;

CREATE UNIQUE INDEX IF NOT EXISTS import_files_canonical_hash_idx
  ON public.import_files (user_id, content_hash)
  WHERE duplicate_of IS NULL AND content_hash IS NOT NULL;

CREATE OR REPLACE FUNCTION public.resolve_canonical_import_file()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_parent uuid := NEW.duplicate_of;
  v_next uuid;
  v_guard integer := 0;
BEGIN
  IF v_parent IS NULL THEN
    RETURN NEW;
  END IF;
  IF v_parent = NEW.id THEN
    NEW.duplicate_of := NULL;
    RETURN NEW;
  END IF;
  LOOP
    SELECT duplicate_of INTO v_next FROM public.import_files WHERE id = v_parent;
    IF v_next IS NULL THEN
      EXIT;
    END IF;
    v_parent := v_next;
    v_guard := v_guard + 1;
    IF v_guard > 20 THEN
      RAISE EXCEPTION 'Cadeia de arquivos duplicados inválida';
    END IF;
    IF v_parent = NEW.id THEN
      NEW.duplicate_of := NULL;
      RETURN NEW;
    END IF;
  END LOOP;
  NEW.duplicate_of := v_parent;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS import_files_canonical_duplicate ON public.import_files;
CREATE TRIGGER import_files_canonical_duplicate
BEFORE INSERT OR UPDATE OF duplicate_of ON public.import_files
FOR EACH ROW EXECUTE FUNCTION public.resolve_canonical_import_file();

-- 3) Reprocessamento transacional dos vínculos automáticos ---------------------
CREATE OR REPLACE FUNCTION public.replace_auto_row_links_rpc(p_batch_id uuid, p_links jsonb)
RETURNS TABLE(deleted_links integer, inserted_links integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := public.require_permission('importData');
  v_deleted integer := 0;
  v_inserted integer := 0;
  v_link jsonb;
  v_row_id uuid;
  v_file_id uuid;
  v_primary boolean;
  v_conf text;
  v_score integer;
  v_page integer;
BEGIN
  IF p_links IS NULL OR jsonb_typeof(p_links) <> 'array' THEN
    RAISE EXCEPTION 'Payload de vínculos inválido';
  END IF;

  PERFORM 1 FROM public.import_batches WHERE id = p_batch_id AND user_id = v_uid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lote não encontrado' USING ERRCODE = '42501';
  END IF;

  CREATE TEMP TABLE _incoming (
    row_id uuid,
    file_id uuid,
    page_number integer,
    score integer,
    confidence text,
    is_primary boolean,
    match_reasons jsonb
  ) ON COMMIT DROP;

  FOR v_link IN SELECT * FROM jsonb_array_elements(p_links) LOOP
    v_row_id  := nullif(v_link->>'row_id','')::uuid;
    v_file_id := nullif(v_link->>'file_id','')::uuid;
    v_conf    := COALESCE(nullif(v_link->>'confidence',''), 'low');
    v_primary := COALESCE((v_link->>'is_primary')::boolean, false);
    v_score   := COALESCE(nullif(v_link->>'score','')::integer, 0);
    v_page    := nullif(v_link->>'page_number','')::integer;

    IF v_row_id IS NULL OR v_file_id IS NULL THEN
      RAISE EXCEPTION 'Vínculo sem linha ou arquivo';
    END IF;
    IF v_conf = 'rejected' THEN
      RAISE EXCEPTION 'Vínculo rejeitado não pode ser recriado automaticamente';
    END IF;
    IF v_primary AND v_conf NOT IN ('very_high','high','manual_confirmed') THEN
      RAISE EXCEPTION 'Somente vínculos de alta confiança podem ser principais';
    END IF;

    PERFORM 1 FROM public.import_rows
    WHERE id = v_row_id AND user_id = v_uid AND batch_id = p_batch_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Linha fora do lote informado' USING ERRCODE = '42501';
    END IF;

    PERFORM 1 FROM public.import_files
    WHERE id = v_file_id AND user_id = v_uid AND batch_id = p_batch_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Arquivo fora do lote informado' USING ERRCODE = '42501';
    END IF;

    -- Preserva decisões humanas: manuais e recusados nunca são recriados.
    IF EXISTS (
      SELECT 1 FROM public.import_row_files
      WHERE row_id = v_row_id AND file_id = v_file_id
        AND (is_manual OR confidence = 'rejected')
    ) THEN
      CONTINUE;
    END IF;

    IF v_primary AND EXISTS (
      SELECT 1 FROM public.import_row_files
      WHERE row_id = v_row_id AND is_manual AND is_primary
    ) THEN
      CONTINUE;
    END IF;

    INSERT INTO _incoming
    VALUES (v_row_id, v_file_id, v_page, v_score, v_conf, v_primary,
            COALESCE(v_link->'match_reasons', '[]'::jsonb));
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM _incoming WHERE is_primary GROUP BY row_id HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Mais de um comprovante principal para a mesma linha';
  END IF;

  DELETE FROM public.import_row_files
  WHERE batch_id = p_batch_id AND user_id = v_uid
    AND is_manual = false AND confidence <> 'rejected';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  INSERT INTO public.import_row_files (
    user_id, batch_id, row_id, file_id, page_number, score,
    confidence, match_reasons, is_manual, is_primary
  )
  SELECT v_uid, p_batch_id, i.row_id, i.file_id, i.page_number, i.score,
         i.confidence, i.match_reasons, false, i.is_primary
  FROM _incoming i
  ON CONFLICT (row_id, file_id, page_number) DO UPDATE SET
    score = EXCLUDED.score,
    confidence = EXCLUDED.confidence,
    match_reasons = EXCLUDED.match_reasons,
    is_primary = EXCLUDED.is_primary,
    updated_at = now();
  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  RETURN QUERY SELECT v_deleted, v_inserted;
END; $$;

-- 4) Lotes travados ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fail_stale_import_batches_rpc(p_minutes integer DEFAULT 30)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := public.require_permission('importData');
  v_count integer := 0;
BEGIN
  IF p_minutes IS NULL OR p_minutes < 1 THEN
    RAISE EXCEPTION 'Limite de tempo inválido';
  END IF;

  UPDATE public.import_batches
  SET status = 'failed',
      phase = 'error',
      finished_at = COALESCE(finished_at, now()),
      updated_at = now()
  WHERE user_id = v_uid
    AND status IN ('running','saving')
    AND updated_at < now() - make_interval(mins => p_minutes);
  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN v_count;
END; $$;