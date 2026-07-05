
GRANT SELECT ON public.questions TO anon;
CREATE POLICY "Anon can read published questions"
  ON public.questions FOR SELECT
  TO anon
  USING (is_published = true);

CREATE POLICY "exam-images read anon"
  ON storage.objects FOR SELECT
  TO anon
  USING (bucket_id = 'exam-images');
