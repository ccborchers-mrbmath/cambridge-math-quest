CREATE POLICY "Authenticated can read exam-images"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'exam-images');

CREATE POLICY "Admins can upload exam-images"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'exam-images' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update exam-images"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'exam-images' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete exam-images"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'exam-images' AND public.has_role(auth.uid(), 'admin'));