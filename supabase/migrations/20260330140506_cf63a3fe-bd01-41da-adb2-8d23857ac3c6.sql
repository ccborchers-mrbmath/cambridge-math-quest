
-- Add DELETE policy for user_roles (admins can delete, but not their own admin role)
CREATE POLICY "Admins can delete roles except own admin"
  ON public.user_roles FOR DELETE
  USING (
    public.has_role(auth.uid(), 'admin') 
    AND NOT (user_id = auth.uid() AND role = 'admin')
  );

-- Add DELETE policy for profiles (users can delete their own profile)
CREATE POLICY "Users can delete their own profile"
  ON public.profiles FOR DELETE
  USING (auth.uid() = user_id);
