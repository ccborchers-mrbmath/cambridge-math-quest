GRANT SELECT ON public.questions TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.questions TO authenticated;
GRANT ALL ON public.questions TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'questions'
      AND policyname = 'Public can view published questions'
  ) THEN
    CREATE POLICY "Public can view published questions"
    ON public.questions
    FOR SELECT
    TO anon
    USING (is_published = true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Public can read exam-images'
  ) THEN
    CREATE POLICY "Public can read exam-images"
    ON storage.objects
    FOR SELECT
    TO anon
    USING (bucket_id = 'exam-images');
  END IF;
END $$;