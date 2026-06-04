ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS question_text text,
  ADD COLUMN IF NOT EXISTS markscheme_text text,
  ADD COLUMN IF NOT EXISTS question_text_status text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS markscheme_text_status text NOT NULL DEFAULT 'none';