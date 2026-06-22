
-- Revoke public/anon execute on SECURITY DEFINER functions; grant to appropriate roles
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_updated_at_column() TO service_role;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;

REVOKE EXECUTE ON FUNCTION public.assign_coach_code() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assign_coach_code() TO service_role;

REVOKE EXECUTE ON FUNCTION public.notify_session_change() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify_session_change() TO service_role;

REVOKE EXECUTE ON FUNCTION public.notify_help_request() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify_help_request() TO service_role;

REVOKE EXECUTE ON FUNCTION public.generate_coach_code() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_coach_code() TO service_role;

REVOKE EXECUTE ON FUNCTION public.find_coach_by_code(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.find_coach_by_code(text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.set_vip_status(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_vip_status(uuid, boolean) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.grant_credits(uuid, numeric, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.grant_credits(uuid, numeric, text, jsonb) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.deduct_credits(uuid, numeric, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.deduct_credits(uuid, numeric, text, jsonb) TO authenticated, service_role;
