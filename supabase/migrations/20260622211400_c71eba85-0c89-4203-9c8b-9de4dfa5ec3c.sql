
-- 1) Lock down SECURITY DEFINER functions from anon/public callers.
-- Helpers safe for any signed-in caller; revoke from anon/public, grant to authenticated.
REVOKE ALL ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.has_active_subscription(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_active_subscription(uuid, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.find_coach_by_code(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.find_coach_by_code(text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.record_question_view(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_question_view(uuid) TO authenticated, service_role;

-- Credit/billing functions: only callable by service_role (edge functions) or admins via RPC.
REVOKE ALL ON FUNCTION public.deduct_credits(uuid, numeric, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.deduct_credits(uuid, numeric, text, jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.grant_credits(uuid, numeric, text, jsonb) FROM PUBLIC, anon;
-- has internal admin check; safe for authenticated to call
GRANT EXECUTE ON FUNCTION public.grant_credits(uuid, numeric, text, jsonb) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.grant_subscription_credits(uuid, numeric, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_subscription_credits(uuid, numeric, timestamptz) TO service_role;

REVOKE ALL ON FUNCTION public.grant_topup_credits(uuid, numeric, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_topup_credits(uuid, numeric, jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.expire_all_credits(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_all_credits(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.set_vip_status(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_vip_status(uuid, boolean) TO authenticated, service_role;

-- Internal helpers / trigger functions: never callable from API.
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assign_coach_code() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_session_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_help_request() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.generate_coach_code() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;

-- 2) Document fail-closed intent on processed_paddle_events.
DROP POLICY IF EXISTS "No client read access" ON public.processed_paddle_events;
CREATE POLICY "No client read access"
  ON public.processed_paddle_events
  FOR SELECT
  TO anon, authenticated
  USING (false);

-- 3) Prevent students from escalating via protected profile columns.
CREATE OR REPLACE FUNCTION public.protect_profile_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;

  IF NEW.credit_multiplier IS DISTINCT FROM OLD.credit_multiplier THEN
    RAISE EXCEPTION 'credit_multiplier can only be changed by an admin';
  END IF;

  IF NEW.coach_code IS DISTINCT FROM OLD.coach_code THEN
    RAISE EXCEPTION 'coach_code is system-managed';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_profile_columns_trg ON public.profiles;
CREATE TRIGGER protect_profile_columns_trg
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_profile_columns();
