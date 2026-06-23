
-- Enum for feedback category
DO $$ BEGIN
  CREATE TYPE public.feedback_category AS ENUM (
    'ai_inaccuracy',
    'wrong_categorisation',
    'bug',
    'feature_request',
    'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.feedback_status AS ENUM ('open','triaged','resolved','wont_fix');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE public.feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  category public.feedback_category NOT NULL,
  message text NOT NULL,
  question_id uuid REFERENCES public.questions(id) ON DELETE SET NULL,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  page_url text,
  status public.feedback_status NOT NULL DEFAULT 'open',
  admin_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.feedback TO authenticated;
GRANT ALL ON public.feedback TO service_role;

ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

-- Users can insert their own feedback
CREATE POLICY "Users insert own feedback"
  ON public.feedback FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Users can view their own feedback
CREATE POLICY "Users view own feedback"
  ON public.feedback FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

-- Admins can update (status / notes)
CREATE POLICY "Admins update feedback"
  ON public.feedback FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Admins can delete
CREATE POLICY "Admins delete feedback"
  ON public.feedback FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Protect users from changing status/admin_notes on their own rows
CREATE OR REPLACE FUNCTION public.protect_feedback_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status
     OR NEW.admin_notes IS DISTINCT FROM OLD.admin_notes THEN
    RAISE EXCEPTION 'status and admin_notes can only be changed by an admin';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.protect_feedback_columns() FROM PUBLIC, anon;

CREATE TRIGGER protect_feedback_columns_trg
  BEFORE UPDATE ON public.feedback
  FOR EACH ROW EXECUTE FUNCTION public.protect_feedback_columns();

CREATE TRIGGER feedback_updated_at
  BEFORE UPDATE ON public.feedback
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX feedback_status_created_idx ON public.feedback (status, created_at DESC);
CREATE INDEX feedback_user_created_idx ON public.feedback (user_id, created_at DESC);
