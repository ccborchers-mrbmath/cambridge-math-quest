-- Add foreign key relationship between student_attempts and profiles
-- This will enable joins in queries
ALTER TABLE public.student_attempts 
ADD CONSTRAINT student_attempts_user_id_fkey_profiles 
FOREIGN KEY (user_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE;