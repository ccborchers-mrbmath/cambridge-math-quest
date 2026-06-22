
-- 1. Subscriptions table
CREATE TABLE public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  paddle_subscription_id text NOT NULL UNIQUE,
  paddle_customer_id text NOT NULL,
  product_id text NOT NULL,
  price_id text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean DEFAULT false,
  last_granted_period_start timestamptz,
  environment text NOT NULL DEFAULT 'sandbox',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_subscriptions_user_id ON public.subscriptions(user_id);
CREATE INDEX idx_subscriptions_paddle_id ON public.subscriptions(paddle_subscription_id);

GRANT SELECT ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own subscriptions"
  ON public.subscriptions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role manages subscriptions"
  ON public.subscriptions FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE TRIGGER subscriptions_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Add credit-bucket columns to user_credits
ALTER TABLE public.user_credits
  ADD COLUMN subscription_credits numeric NOT NULL DEFAULT 0,
  ADD COLUMN topup_credits numeric NOT NULL DEFAULT 0;

-- Migrate existing balance into topup bucket (treat as rollover)
UPDATE public.user_credits SET topup_credits = balance WHERE balance > 0;

-- 3. has_active_subscription helper
CREATE OR REPLACE FUNCTION public.has_active_subscription(
  user_uuid uuid,
  check_env text DEFAULT 'live'
)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.subscriptions
    WHERE user_id = user_uuid
      AND environment = check_env
      AND (
        (status IN ('active','trialing','past_due') AND (current_period_end IS NULL OR current_period_end > now()))
        OR (status = 'canceled' AND current_period_end > now())
      )
  );
$$;

-- 4. Grant subscription credits (called per period — resets sub bucket to _amount)
CREATE OR REPLACE FUNCTION public.grant_subscription_credits(
  _user_id uuid,
  _amount numeric,
  _expires_at timestamptz
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_credits(user_id, subscription_credits, balance, credits_expire_at, subscription_status)
    VALUES (_user_id, _amount, _amount, _expires_at, 'active')
    ON CONFLICT (user_id) DO UPDATE
      SET subscription_credits = _amount,
          balance = _amount + public.user_credits.topup_credits,
          credits_expire_at = _expires_at,
          subscription_status = 'active',
          updated_at = now();

  INSERT INTO public.credit_transactions(user_id, amount, reason, metadata)
    VALUES (_user_id, _amount, 'subscription_grant', jsonb_build_object('expires_at', _expires_at));
END;
$$;

-- 5. Grant top-up credits (additive to topup bucket)
CREATE OR REPLACE FUNCTION public.grant_topup_credits(
  _user_id uuid,
  _amount numeric,
  _metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_credits(user_id, topup_credits, balance)
    VALUES (_user_id, _amount, _amount)
    ON CONFLICT (user_id) DO UPDATE
      SET topup_credits = public.user_credits.topup_credits + _amount,
          balance = public.user_credits.subscription_credits + public.user_credits.topup_credits + _amount,
          updated_at = now();

  INSERT INTO public.credit_transactions(user_id, amount, reason, metadata)
    VALUES (_user_id, _amount, 'topup_purchase', _metadata);
END;
$$;

-- 6. Expire all credits (called when subscription ends)
CREATE OR REPLACE FUNCTION public.expire_all_credits(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _prev numeric;
BEGIN
  SELECT balance INTO _prev FROM public.user_credits WHERE user_id = _user_id;
  IF _prev IS NULL OR _prev = 0 THEN RETURN; END IF;

  UPDATE public.user_credits
    SET subscription_credits = 0,
        topup_credits = 0,
        balance = 0,
        subscription_status = 'expired',
        updated_at = now()
    WHERE user_id = _user_id;

  INSERT INTO public.credit_transactions(user_id, amount, reason, metadata)
    VALUES (_user_id, -_prev, 'subscription_expired', '{}'::jsonb);
END;
$$;

-- 7. Update deduct_credits to spend subscription bucket first, then top-ups
CREATE OR REPLACE FUNCTION public.deduct_credits(_user_id uuid, _base_cost numeric, _reason text, _metadata jsonb DEFAULT '{}'::jsonb)
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
BEGIN
  SELECT public.has_role(_user_id, 'admin') INTO _is_admin;
  IF _is_admin THEN
    UPDATE public.profiles SET last_ai_use_at = now() WHERE user_id = _user_id;
    RETURN jsonb_build_object('allowed', true, 'reason', 'admin_bypass', 'charged', 0, 'new_balance', NULL);
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
