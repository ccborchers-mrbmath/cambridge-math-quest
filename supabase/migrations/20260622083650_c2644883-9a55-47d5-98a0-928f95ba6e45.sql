
-- Grant admin role to ccborchers@gmail.com if account exists
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::app_role FROM auth.users WHERE email = 'ccborchers@gmail.com'
ON CONFLICT (user_id, role) DO NOTHING;

-- Update new-user trigger so ccborchers@gmail.com auto-gets admin on first sign-in,
-- everyone else stays 'student'
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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

  RETURN NEW;
END;
$function$;

-- Harden user_roles INSERT policy: block clients from self-assigning admin.
-- (Triggers run as SECURITY DEFINER and bypass RLS, so the email-based admin grant still works.)
DROP POLICY IF EXISTS "Users can insert their own non-admin role" ON public.user_roles;
DROP POLICY IF EXISTS "Users can self-assign student or coach roles" ON public.user_roles;
CREATE POLICY "Users can self-assign student or coach roles"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id AND role IN ('student','coach'));
