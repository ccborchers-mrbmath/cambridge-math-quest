ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS topic_id text,
  ADD COLUMN IF NOT EXISTS subtopic_ids text[];

CREATE INDEX IF NOT EXISTS questions_topic_id_idx ON public.questions(topic_id);
CREATE INDEX IF NOT EXISTS questions_subtopic_ids_idx ON public.questions USING GIN(subtopic_ids);