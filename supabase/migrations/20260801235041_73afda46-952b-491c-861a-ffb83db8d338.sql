REVOKE ALL ON FUNCTION public.grant_owner_role() FROM authenticated, anon, PUBLIC;
REVOKE ALL ON FUNCTION public.seed_default_data_for_user() FROM authenticated, anon, PUBLIC;
REVOKE ALL ON FUNCTION public.touch_updated_at() FROM authenticated, anon, PUBLIC;
REVOKE ALL ON FUNCTION public.role_permissions(public.app_role) FROM anon;