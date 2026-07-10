-- The admin panel needs to see every user, not just ones directly linked as
-- coach/student. user_credits already has an admin-view-all policy; profiles
-- and user_roles were missing the equivalent, so admins only ever saw their
-- own profile/roles plus any linked students.

CREATE POLICY "Admins view all profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins view all roles"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Admin-only: set an arbitrary credit multiplier (rate) per user, e.g. to
-- offer discounted or premium pricing to specific groups. 0 zeroes the
-- charge but still requires an active subscription in deduct_credits;
-- use set_billing_exempt for a true no-subscription-required exemption.
CREATE OR REPLACE FUNCTION public.set_credit_multiplier(_user_id uuid, _multiplier numeric)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can set credit rates';
  END IF;

  IF _multiplier < 0 THEN
    RAISE EXCEPTION 'Credit multiplier cannot be negative';
  END IF;

  UPDATE public.profiles SET credit_multiplier = _multiplier WHERE user_id = _user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_credit_multiplier(uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_credit_multiplier(uuid, numeric) TO authenticated, service_role;
