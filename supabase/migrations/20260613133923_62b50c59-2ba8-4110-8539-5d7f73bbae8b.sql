
-- 1. Lock questions writes to admins only
DROP POLICY IF EXISTS "Authenticated can insert questions" ON public.questions;
DROP POLICY IF EXISTS "Authenticated can update questions" ON public.questions;
DROP POLICY IF EXISTS "Authenticated can delete questions" ON public.questions;

CREATE POLICY "Admins can insert questions"
  ON public.questions FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update questions"
  ON public.questions FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete questions"
  ON public.questions FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 2. Restrict user_roles SELECT to own row (has_role uses SECURITY DEFINER so still works)
DROP POLICY IF EXISTS "Authenticated can read user roles" ON public.user_roles;

CREATE POLICY "Users read own roles"
  ON public.user_roles FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- 3. Lock exam-images bucket writes to admins; keep reads for all authenticated
DROP POLICY IF EXISTS "exam-images insert authenticated" ON storage.objects;
DROP POLICY IF EXISTS "exam-images update authenticated" ON storage.objects;
DROP POLICY IF EXISTS "exam-images delete authenticated" ON storage.objects;

CREATE POLICY "exam-images admin insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'exam-images' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "exam-images admin update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'exam-images' AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (bucket_id = 'exam-images' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "exam-images admin delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'exam-images' AND public.has_role(auth.uid(), 'admin'));
