-- Restore EXECUTE on has_role for authenticated. RLS policies and the
-- AdminDashboard rpc('has_role') call both require this. Keep PUBLIC/anon
-- revoked so it can't be probed without a session.
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
