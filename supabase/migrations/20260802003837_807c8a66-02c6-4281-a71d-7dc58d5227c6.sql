REVOKE EXECUTE ON FUNCTION public.replace_auto_row_links_rpc(uuid, jsonb) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.fail_stale_import_batches_rpc(integer) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.replace_auto_row_links_rpc(uuid, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fail_stale_import_batches_rpc(integer) TO authenticated, service_role;