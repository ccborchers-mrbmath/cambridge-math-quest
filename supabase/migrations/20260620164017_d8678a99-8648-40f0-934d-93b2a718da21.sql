
-- 1. Profiles: drop blanket read, add linked-coach/student read
DROP POLICY IF EXISTS "Authenticated can view profiles" ON public.profiles;

CREATE POLICY "Linked coach and student can view each other"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.coach_student_links l
    WHERE (l.coach_id = auth.uid() AND l.student_id = public.profiles.user_id)
       OR (l.student_id = auth.uid() AND l.coach_id = public.profiles.user_id)
  )
);

-- 2. Secure coach lookup by code (avoids exposing profiles table)
CREATE OR REPLACE FUNCTION public.find_coach_by_code(_code text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.user_id
  FROM public.profiles p
  WHERE p.coach_code = _code
    AND public.has_role(p.user_id, 'coach')
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.find_coach_by_code(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.find_coach_by_code(text) TO authenticated;

-- 3. user_roles: prevent self-assignment of admin role
DROP POLICY IF EXISTS "Users can insert their own role" ON public.user_roles;

CREATE POLICY "Users can self-assign student or coach"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id AND role IN ('student'::app_role, 'coach'::app_role)
);

-- 4. Remove unused tables from realtime publication
ALTER PUBLICATION supabase_realtime DROP TABLE public.help_requests;
ALTER PUBLICATION supabase_realtime DROP TABLE public.sessions;
ALTER PUBLICATION supabase_realtime DROP TABLE public.notifications;
