
-- 1. Idempotency for Paddle webhook events
CREATE TABLE IF NOT EXISTS public.processed_paddle_events (
  event_id text PRIMARY KEY,
  event_type text NOT NULL,
  environment text NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.processed_paddle_events TO service_role;
ALTER TABLE public.processed_paddle_events ENABLE ROW LEVEL SECURITY;
-- service-role only; no policies for anon/authenticated

-- 2. Daily question view tracking for free-tier soft cap
CREATE TABLE IF NOT EXISTS public.daily_question_views (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day date NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
  view_count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, day)
);

GRANT SELECT, INSERT, UPDATE ON public.daily_question_views TO authenticated;
GRANT ALL ON public.daily_question_views TO service_role;
ALTER TABLE public.daily_question_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own view counts"
  ON public.daily_question_views FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- writes happen via SECURITY DEFINER RPC below; no INSERT/UPDATE policies needed

-- RPC: increment today's view count and return current count.
-- SECURITY DEFINER so the user can't manipulate their own count via direct UPDATE.
CREATE OR REPLACE FUNCTION public.record_question_view(_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _count integer;
BEGIN
  IF auth.uid() IS DISTINCT FROM _user_id THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  INSERT INTO public.daily_question_views(user_id, day, view_count)
    VALUES (_user_id, (now() AT TIME ZONE 'utc')::date, 1)
    ON CONFLICT (user_id, day) DO UPDATE
      SET view_count = public.daily_question_views.view_count + 1,
          updated_at = now()
    RETURNING view_count INTO _count;

  RETURN jsonb_build_object('count', _count);
END;
$$;

-- 3. Lazy credit expiry + active-subscription gate baked into deduct_credits.
-- Replaces the previous version.
CREATE OR REPLACE FUNCTION public.deduct_credits(
  _user_id uuid,
  _base_cost numeric,
  _reason text,
  _metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _multiplier numeric;
  _charge numeric;
  _sub numeric;
  _top numeric;
  _remaining numeric;
  _from_sub numeric;
  _from_top numeric;
  _is_admin boolean;
  _has_sub_sandbox boolean;
  _has_sub_live boolean;
  _has_sub boolean;
BEGIN
  SELECT public.has_role(_user_id, 'admin') INTO _is_admin;
  IF _is_admin THEN
    UPDATE public.profiles SET last_ai_use_at = now() WHERE user_id = _user_id;
    RETURN jsonb_build_object('allowed', true, 'reason', 'admin_bypass', 'charged', 0, 'new_balance', NULL);
  END IF;

  -- Active subscription required in either environment (sandbox for preview, live for prod).
  SELECT public.has_active_subscription(_user_id, 'sandbox') INTO _has_sub_sandbox;
  SELECT public.has_active_subscription(_user_id, 'live') INTO _has_sub_live;
  _has_sub := _has_sub_sandbox OR _has_sub_live;

  IF NOT _has_sub THEN
    -- Lazy expiry: zero any leftover credits the moment the user falls out of an active subscription.
    PERFORM public.expire_all_credits(_user_id);
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'no_active_subscription',
      'charged', 0,
      'new_balance', 0
    );
  END IF;

  SELECT COALESCE(credit_multiplier, 1.0) INTO _multiplier
    FROM public.profiles WHERE user_id = _user_id;
  IF _multiplier IS NULL THEN _multiplier := 1.0; END IF;

  _charge := _base_cost * _multiplier;

  SELECT subscription_credits, topup_credits
    INTO _sub, _top
    FROM public.user_credits
    WHERE user_id = _user_id
    FOR UPDATE;

  IF _sub IS NULL THEN
    INSERT INTO public.user_credits(user_id) VALUES (_user_id)
      ON CONFLICT (user_id) DO NOTHING;
    _sub := 0; _top := 0;
  END IF;

  IF (_sub + _top) < _charge THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'insufficient_credits', 'charged', 0, 'new_balance', _sub + _top);
  END IF;

  _from_sub := LEAST(_sub, _charge);
  _from_top := _charge - _from_sub;
  _remaining := (_sub - _from_sub) + (_top - _from_top);

  UPDATE public.user_credits
    SET subscription_credits = subscription_credits - _from_sub,
        topup_credits = topup_credits - _from_top,
        balance = _remaining,
        updated_at = now()
    WHERE user_id = _user_id;

  INSERT INTO public.credit_transactions(user_id, amount, reason, metadata)
    VALUES (_user_id, -_charge, _reason, _metadata || jsonb_build_object('from_subscription', _from_sub, 'from_topup', _from_top));

  UPDATE public.profiles SET last_ai_use_at = now() WHERE user_id = _user_id;

  RETURN jsonb_build_object('allowed', true, 'reason', 'charged', 'charged', _charge, 'new_balance', _remaining);
END;
$$;
