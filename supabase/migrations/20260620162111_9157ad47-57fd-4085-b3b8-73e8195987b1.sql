
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS share_progress_with_coaches boolean NOT NULL DEFAULT false;

CREATE POLICY "Coaches read shared attempts"
ON public.student_attempts
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.coach_student_links l
    JOIN public.profiles p ON p.user_id = l.student_id
    WHERE l.coach_id = auth.uid()
      AND l.student_id = student_attempts.user_id
      AND p.share_progress_with_coaches = true
  )
);
