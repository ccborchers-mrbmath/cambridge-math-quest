
DROP POLICY IF EXISTS "Authenticated can view profiles" ON public.profiles;
CREATE POLICY "Authenticated can view profiles"
ON public.profiles
FOR SELECT TO authenticated
USING (true);
