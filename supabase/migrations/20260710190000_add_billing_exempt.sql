-- Allow admins to exempt specific users from credit billing entirely
-- (they keep app access but AI actions never burn credits).

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS billing_exempt boolean NOT NULL DEFAULT false;

-- Admin-only toggle, mirrors set_vip_status.
CREATE OR REPLACE FUNCTION public.set_billing_exempt(_user_id uuid, _exempt boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can change billing exemption';
  END IF;

  UPDATE public.profiles SET billing_exempt = _exempt WHERE user_id = _user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_billing_exempt(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_billing_exempt(uuid, boolean) TO authenticated, service_role;

-- Students must not be able to flip their own billing_exempt flag directly.
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

  IF NEW.billing_exempt IS DISTINCT FROM OLD.billing_exempt THEN
    RAISE EXCEPTION 'billing_exempt can only be changed by an admin';
  END IF;

  RETURN NEW;
END;
$$;

-- Bypass billing for exempt users, same short-circuit as the admin bypass.
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
  _is_billing_exempt boolean;
  _has_sub_sandbox boolean;
  _has_sub_live boolean;
  _has_sub boolean;
BEGIN
  SELECT public.has_role(_user_id, 'admin') INTO _is_admin;
  IF _is_admin THEN
    UPDATE public.profiles SET last_ai_use_at = now() WHERE user_id = _user_id;
    RETURN jsonb_build_object('allowed', true, 'reason', 'admin_bypass', 'charged', 0, 'new_balance', NULL);
  END IF;

  SELECT COALESCE(billing_exempt, false) INTO _is_billing_exempt
    FROM public.profiles WHERE user_id = _user_id;
  IF _is_billing_exempt THEN
    UPDATE public.profiles SET last_ai_use_at = now() WHERE user_id = _user_id;
    RETURN jsonb_build_object('allowed', true, 'reason', 'billing_exempt', 'charged', 0, 'new_balance', NULL);
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
