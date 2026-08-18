CREATE TYPE public.self_confidence AS ENUM ('easy','ok','struggled');

CREATE TABLE public.manual_completions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  module module_code NOT NULL,
  year integer NOT NULL,
  sitting text NOT NULL,
  paper_number integer NOT NULL,
  question_number integer NOT NULL,
  topic text,
  confidence public.self_confidence NOT NULL DEFAULT 'ok',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, year, sitting, paper_number, question_number)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.manual_completions TO authenticated;
GRANT ALL ON public.manual_completions TO service_role;

ALTER TABLE public.manual_completions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own manual completions"
  ON public.manual_completions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own manual completions"
  ON public.manual_completions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own manual completions"
  ON public.manual_completions FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own manual completions"
  ON public.manual_completions FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER manual_completions_updated_at
  BEFORE UPDATE ON public.manual_completions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_manual_completions_user ON public.manual_completions(user_id);