CREATE SCHEMA IF NOT EXISTS private;

CREATE OR REPLACE FUNCTION private.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private TO postgres, service_role;
REVOKE ALL ON FUNCTION private.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) TO postgres, service_role;

ALTER POLICY "Admins can view all roles"
ON public.user_roles
USING (private.has_role(auth.uid(), 'admin'::public.app_role));

ALTER POLICY "Admins can insert roles"
ON public.user_roles
WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));

ALTER POLICY "Admins can update roles"
ON public.user_roles
USING (private.has_role(auth.uid(), 'admin'::public.app_role));

ALTER POLICY "Admins can delete roles except own admin"
ON public.user_roles
USING (
  private.has_role(auth.uid(), 'admin'::public.app_role)
  AND NOT ((user_id = auth.uid()) AND (role = 'admin'::public.app_role))
);

ALTER POLICY "Admins can view all profiles"
ON public.profiles
USING (private.has_role(auth.uid(), 'admin'::public.app_role));

ALTER POLICY "Admins can view all attempts"
ON public.student_attempts
USING (private.has_role(auth.uid(), 'admin'::public.app_role));

ALTER POLICY "Admins can update all attempts"
ON public.student_attempts
USING (private.has_role(auth.uid(), 'admin'::public.app_role));

ALTER POLICY "Admins can update questions"
ON public.questions
USING (private.has_role(auth.uid(), 'admin'::public.app_role));

ALTER POLICY "Admins can insert questions"
ON public.questions
WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));

ALTER POLICY "Admins can delete questions"
ON public.questions
USING (private.has_role(auth.uid(), 'admin'::public.app_role));

ALTER POLICY "Admins can upload exam-images"
ON storage.objects
WITH CHECK (bucket_id = 'exam-images' AND private.has_role(auth.uid(), 'admin'::public.app_role));

ALTER POLICY "Admins can update exam-images"
ON storage.objects
USING (bucket_id = 'exam-images' AND private.has_role(auth.uid(), 'admin'::public.app_role));

ALTER POLICY "Admins can delete exam-images"
ON storage.objects
USING (bucket_id = 'exam-images' AND private.has_role(auth.uid(), 'admin'::public.app_role));

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated, service_role;