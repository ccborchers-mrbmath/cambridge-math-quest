
-- Fix: Sessions INSERT must verify a coach_student_links row exists between student and coach
DROP POLICY IF EXISTS "Student confirms (creates) session" ON public.sessions;
CREATE POLICY "Student confirms (creates) session"
ON public.sessions
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = student_id
  AND EXISTS (
    SELECT 1 FROM public.coach_student_links l
    WHERE l.student_id = auth.uid() AND l.coach_id = sessions.coach_id
  )
);

-- Fix: Revoke EXECUTE from anon/public on SECURITY DEFINER functions; restrict to authenticated
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.find_coach_by_code(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.generate_coach_code() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.find_coach_by_code(text) TO authenticated;
-- generate_coach_code is only used by trigger/internal; keep restricted
