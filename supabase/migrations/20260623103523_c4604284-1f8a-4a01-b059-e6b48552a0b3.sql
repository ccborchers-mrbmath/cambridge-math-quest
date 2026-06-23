
-- Drop duplicate INSERT policy on user_roles
DROP POLICY IF EXISTS "Users can self-assign student or coach roles" ON public.user_roles;

-- Revoke EXECUTE on SECURITY DEFINER functions from anon and public
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.has_active_subscription(uuid, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.find_coach_by_code(text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.set_vip_status(uuid, boolean) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.grant_subscription_credits(uuid, numeric, timestamptz) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.expire_all_credits(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.record_question_view(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.deduct_credits(uuid, numeric, text, jsonb) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.grant_topup_credits(uuid, numeric, jsonb) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.grant_credits(uuid, numeric, text, jsonb) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.generate_coach_code() FROM anon, public;

-- Ensure authenticated and service_role retain needed access for RPC + RLS usage
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_active_subscription(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.find_coach_by_code(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_vip_status(uuid, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_question_view(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.deduct_credits(uuid, numeric, text, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.grant_subscription_credits(uuid, numeric, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.expire_all_credits(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.grant_topup_credits(uuid, numeric, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.grant_credits(uuid, numeric, text, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.generate_coach_code() TO service_role;
