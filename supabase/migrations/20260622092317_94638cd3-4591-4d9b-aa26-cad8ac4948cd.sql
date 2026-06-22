-- 1. Add 'vip' to app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'vip';

-- 2. Profile additions: credit multiplier + inactivity tracking
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS credit_multiplier numeric(4,2) NOT NULL DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS last_ai_use_at timestamptz;

-- 3. user_credits: current balance per user
CREATE TABLE IF NOT EXISTS public.user_credits (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  balance numeric(10,2) NOT NULL DEFAULT 0,
  trial_started_at timestamptz,
  trial_ends_at timestamptz,
  subscription_status text NOT NULL DEFAULT 'none', -- none|trial|active|cancelled|paused
  subscription_ends_at timestamptz,
  credits_expire_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.user_credits TO authenticated;
GRANT ALL ON public.user_credits TO service_role;

ALTER TABLE public.user_credits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view their own credits"
  ON public.user_credits FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins view all credits"
  ON public.user_credits FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER user_credits_set_updated_at
  BEFORE UPDATE ON public.user_credits
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. credit_transactions: append-only ledger
CREATE TABLE IF NOT EXISTS public.credit_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount numeric(10,2) NOT NULL, -- positive = grant, negative = spend
  reason text NOT NULL, -- 'ai_mark' | 'ai_hint' | 'test_mark' | 'admin_grant' | 'subscription_grant' | 'topup' | 'trial_grant' | 'expiry'
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS credit_transactions_user_idx
  ON public.credit_transactions(user_id, created_at DESC);

GRANT SELECT ON public.credit_transactions TO authenticated;
GRANT ALL ON public.credit_transactions TO service_role;

ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view their own credit history"
  ON public.credit_transactions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins view all credit history"
  ON public.credit_transactions FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 5. Server-side deduct function (used by AI edge functions)
-- Returns jsonb: { allowed: bool, reason: text, new_balance: numeric, charged: numeric }
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
  _balance numeric;
  _is_admin boolean;
BEGIN
  -- Admins bypass entirely
  SELECT public.has_role(_user_id, 'admin') INTO _is_admin;
  IF _is_admin THEN
    UPDATE public.profiles SET last_ai_use_at = now() WHERE user_id = _user_id;
    RETURN jsonb_build_object('allowed', true, 'reason', 'admin_bypass', 'charged', 0, 'new_balance', null);
  END IF;

  -- Read multiplier (defaults to 1.0)
  SELECT COALESCE(credit_multiplier, 1.0) INTO _multiplier
    FROM public.profiles WHERE user_id = _user_id;
  IF _multiplier IS NULL THEN _multiplier := 1.0; END IF;

  _charge := _base_cost * _multiplier;

  -- Lock row, check + deduct atomically
  SELECT balance INTO _balance FROM public.user_credits WHERE user_id = _user_id FOR UPDATE;

  IF _balance IS NULL THEN
    INSERT INTO public.user_credits(user_id, balance) VALUES (_user_id, 0);
    _balance := 0;
  END IF;

  IF _balance < _charge THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'insufficient_credits', 'charged', 0, 'new_balance', _balance);
  END IF;

  UPDATE public.user_credits
    SET balance = balance - _charge
    WHERE user_id = _user_id
    RETURNING balance INTO _balance;

  INSERT INTO public.credit_transactions(user_id, amount, reason, metadata)
    VALUES (_user_id, -_charge, _reason, _metadata);

  UPDATE public.profiles SET last_ai_use_at = now() WHERE user_id = _user_id;

  RETURN jsonb_build_object('allowed', true, 'reason', 'charged', 'charged', _charge, 'new_balance', _balance);
END;
$$;

REVOKE ALL ON FUNCTION public.deduct_credits(uuid, numeric, text, jsonb) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.deduct_credits(uuid, numeric, text, jsonb) TO service_role;

-- 6. Admin-only grant function (callable from admin UI via RPC)
CREATE OR REPLACE FUNCTION public.grant_credits(
  _user_id uuid,
  _amount numeric,
  _reason text DEFAULT 'admin_grant',
  _metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _new_balance numeric;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can grant credits';
  END IF;

  IF _amount <= 0 THEN
    RAISE EXCEPTION 'Grant amount must be positive';
  END IF;

  INSERT INTO public.user_credits(user_id, balance)
    VALUES (_user_id, _amount)
    ON CONFLICT (user_id) DO UPDATE
      SET balance = public.user_credits.balance + EXCLUDED.balance
    RETURNING balance INTO _new_balance;

  INSERT INTO public.credit_transactions(user_id, amount, reason, metadata)
    VALUES (_user_id, _amount, _reason, _metadata);

  RETURN jsonb_build_object('new_balance', _new_balance);
END;
$$;

GRANT EXECUTE ON FUNCTION public.grant_credits(uuid, numeric, text, jsonb) TO authenticated;

-- 7. Admin-only VIP toggle (sets role + multiplier in one call)
CREATE OR REPLACE FUNCTION public.set_vip_status(_user_id uuid, _is_vip boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can set VIP status';
  END IF;

  IF _is_vip THEN
    INSERT INTO public.user_roles(user_id, role) VALUES (_user_id, 'vip')
      ON CONFLICT (user_id, role) DO NOTHING;
    UPDATE public.profiles SET credit_multiplier = 0.2 WHERE user_id = _user_id;
  ELSE
    DELETE FROM public.user_roles WHERE user_id = _user_id AND role = 'vip';
    UPDATE public.profiles SET credit_multiplier = 1.0 WHERE user_id = _user_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_vip_status(uuid, boolean) TO authenticated;

-- 8. Auto-create user_credits row on new user (extend existing handle_new_user)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name')
  );

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'student')
  ON CONFLICT (user_id, role) DO NOTHING;

  IF NEW.email = 'ccborchers@gmail.com' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  INSERT INTO public.user_credits(user_id, balance)
    VALUES (NEW.id, 0)
    ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- 9. Backfill: ensure every existing profile has a user_credits row
INSERT INTO public.user_credits(user_id, balance)
SELECT user_id, 0 FROM public.profiles
ON CONFLICT (user_id) DO NOTHING;