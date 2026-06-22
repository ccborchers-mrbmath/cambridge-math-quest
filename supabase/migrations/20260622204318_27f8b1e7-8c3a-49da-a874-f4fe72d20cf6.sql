
REVOKE EXECUTE ON FUNCTION public.grant_subscription_credits(uuid, numeric, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.grant_topup_credits(uuid, numeric, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.expire_all_credits(uuid) FROM PUBLIC, anon, authenticated;
