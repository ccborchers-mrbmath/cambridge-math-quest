CREATE TYPE public.module_code AS ENUM ('P1','P2','P3','S1','S2','M1');
ALTER TABLE public.questions ADD COLUMN module public.module_code;
UPDATE public.questions SET module = 'P3' WHERE module IS NULL;
ALTER TABLE public.questions ALTER COLUMN module SET NOT NULL;
ALTER TABLE public.questions ALTER COLUMN module SET DEFAULT 'P3';
CREATE INDEX IF NOT EXISTS questions_module_topic_idx ON public.questions (module, topic);