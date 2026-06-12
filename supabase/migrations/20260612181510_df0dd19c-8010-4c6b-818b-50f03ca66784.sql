
-- ============ public.questions: open to all authenticated users ============
DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='questions' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.questions', p.policyname);
  END LOOP;
END$$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.questions TO authenticated;
GRANT ALL ON public.questions TO service_role;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read questions"
  ON public.questions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert questions"
  ON public.questions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update questions"
  ON public.questions FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated can delete questions"
  ON public.questions FOR DELETE TO authenticated USING (true);

-- ============ public.profiles: self-only ============
DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='profiles' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.profiles', p.policyname);
  END LOOP;
END$$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own profile"
  ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users update own profile"
  ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users insert own profile"
  ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- ============ public.user_roles: read-only to authenticated ============
DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='user_roles' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.user_roles', p.policyname);
  END LOOP;
END$$;

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read user roles"
  ON public.user_roles FOR SELECT TO authenticated USING (true);

-- ============ public.student_attempts: keep self-only ============
DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='student_attempts' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.student_attempts', p.policyname);
  END LOOP;
END$$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_attempts TO authenticated;
GRANT ALL ON public.student_attempts TO service_role;
ALTER TABLE public.student_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own attempts"
  ON public.student_attempts FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own attempts"
  ON public.student_attempts FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own attempts"
  ON public.student_attempts FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own attempts"
  ON public.student_attempts FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ============ storage.objects: open exam-images to authenticated ============
DO $$
DECLARE p record;
BEGIN
  FOR p IN
    SELECT policyname FROM pg_policies
    WHERE schemaname='storage' AND tablename='objects'
      AND (policyname ILIKE '%exam-images%' OR policyname ILIKE '%exam_images%')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', p.policyname);
  END LOOP;
END$$;

CREATE POLICY "exam-images read authenticated"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'exam-images');
CREATE POLICY "exam-images insert authenticated"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'exam-images');
CREATE POLICY "exam-images update authenticated"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'exam-images') WITH CHECK (bucket_id = 'exam-images');
CREATE POLICY "exam-images delete authenticated"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'exam-images');
