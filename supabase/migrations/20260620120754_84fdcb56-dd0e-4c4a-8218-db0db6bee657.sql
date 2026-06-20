
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'coach';

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS coach_code TEXT UNIQUE;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS display_name TEXT;

DROP POLICY IF EXISTS "Users can insert their own role" ON public.user_roles;
CREATE POLICY "Users can insert their own role"
ON public.user_roles
FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);
