
-- Status enums
DO $$ BEGIN
  CREATE TYPE public.help_request_status AS ENUM ('pending','accepted','declined','scheduled','completed','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.session_status AS ENUM ('scheduled','in_progress','completed','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Random coach code generator
CREATE OR REPLACE FUNCTION public.generate_coach_code()
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  alphabet TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code TEXT; i INT;
BEGIN
  LOOP
    code := '';
    FOR i IN 1..8 LOOP
      code := code || substr(alphabet, 1 + floor(random()*length(alphabet))::int, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.profiles WHERE coach_code = code);
  END LOOP;
  RETURN code;
END; $$;
REVOKE EXECUTE ON FUNCTION public.generate_coach_code() FROM PUBLIC, anon, authenticated;

-- Auto-assign coach_code when role 'coach' is added
CREATE OR REPLACE FUNCTION public.assign_coach_code()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.role = 'coach' THEN
    UPDATE public.profiles
      SET coach_code = public.generate_coach_code()
      WHERE user_id = NEW.user_id AND coach_code IS NULL;
  END IF;
  RETURN NEW;
END; $$;
REVOKE EXECUTE ON FUNCTION public.assign_coach_code() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_assign_coach_code ON public.user_roles;
CREATE TRIGGER trg_assign_coach_code
AFTER INSERT ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.assign_coach_code();

-- coach_student_links
CREATE TABLE IF NOT EXISTS public.coach_student_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (coach_id, student_id)
);
GRANT SELECT, INSERT, DELETE ON public.coach_student_links TO authenticated;
GRANT ALL ON public.coach_student_links TO service_role;
ALTER TABLE public.coach_student_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Participants view their links" ON public.coach_student_links
  FOR SELECT TO authenticated USING (auth.uid() = coach_id OR auth.uid() = student_id);
CREATE POLICY "Student creates link to coach" ON public.coach_student_links
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = student_id AND public.has_role(coach_id, 'coach'::public.app_role));
CREATE POLICY "Either party can unlink" ON public.coach_student_links
  FOR DELETE TO authenticated USING (auth.uid() = coach_id OR auth.uid() = student_id);

-- help_requests
CREATE TABLE IF NOT EXISTS public.help_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  coach_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  message TEXT NOT NULL DEFAULT '',
  status public.help_request_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.help_requests TO authenticated;
GRANT ALL ON public.help_requests TO service_role;
ALTER TABLE public.help_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Participants view requests" ON public.help_requests
  FOR SELECT TO authenticated USING (auth.uid() = student_id OR auth.uid() = coach_id);
CREATE POLICY "Student creates request to linked coach" ON public.help_requests
  FOR INSERT TO authenticated WITH CHECK (
    auth.uid() = student_id
    AND EXISTS (SELECT 1 FROM public.coach_student_links l
                WHERE l.student_id = auth.uid() AND l.coach_id = help_requests.coach_id));
CREATE POLICY "Participants update request" ON public.help_requests
  FOR UPDATE TO authenticated
  USING (auth.uid() = student_id OR auth.uid() = coach_id)
  WITH CHECK (auth.uid() = student_id OR auth.uid() = coach_id);
CREATE TRIGGER trg_help_requests_updated BEFORE UPDATE ON public.help_requests
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- proposed_slots
CREATE TABLE IF NOT EXISTS public.proposed_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES public.help_requests(id) ON DELETE CASCADE,
  scheduled_at TIMESTAMPTZ NOT NULL,
  duration_minutes INT NOT NULL DEFAULT 30,
  proposed_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.proposed_slots TO authenticated;
GRANT ALL ON public.proposed_slots TO service_role;
ALTER TABLE public.proposed_slots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Request participants view slots" ON public.proposed_slots
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.help_requests r
            WHERE r.id = proposed_slots.request_id
            AND (r.student_id = auth.uid() OR r.coach_id = auth.uid())));
CREATE POLICY "Coach proposes slots" ON public.proposed_slots
  FOR INSERT TO authenticated WITH CHECK (
    auth.uid() = proposed_by
    AND EXISTS (SELECT 1 FROM public.help_requests r
                WHERE r.id = proposed_slots.request_id AND r.coach_id = auth.uid()));
CREATE POLICY "Coach removes own slots" ON public.proposed_slots
  FOR DELETE TO authenticated USING (auth.uid() = proposed_by);

-- sessions
CREATE TABLE IF NOT EXISTS public.sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID REFERENCES public.help_requests(id) ON DELETE SET NULL,
  coach_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scheduled_at TIMESTAMPTZ NOT NULL,
  duration_minutes INT NOT NULL DEFAULT 30,
  status public.session_status NOT NULL DEFAULT 'scheduled',
  daily_room_url TEXT,
  daily_room_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.sessions TO authenticated;
GRANT ALL ON public.sessions TO service_role;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Participants view sessions" ON public.sessions
  FOR SELECT TO authenticated USING (auth.uid() = coach_id OR auth.uid() = student_id);
CREATE POLICY "Student confirms (creates) session" ON public.sessions
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = student_id);
CREATE POLICY "Participants update sessions" ON public.sessions
  FOR UPDATE TO authenticated
  USING (auth.uid() = coach_id OR auth.uid() = student_id)
  WITH CHECK (auth.uid() = coach_id OR auth.uid() = student_id);
CREATE TRIGGER trg_sessions_updated BEFORE UPDATE ON public.sessions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- notifications
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own notifications" ON public.notifications
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users mark own notifications read" ON public.notifications
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Notify triggers
CREATE OR REPLACE FUNCTION public.notify_help_request()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.notifications (user_id, kind, payload)
  VALUES (NEW.coach_id, 'help_request_created',
          jsonb_build_object('request_id', NEW.id, 'subject', NEW.subject, 'student_id', NEW.student_id));
  RETURN NEW;
END; $$;
REVOKE EXECUTE ON FUNCTION public.notify_help_request() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_notify_help_request ON public.help_requests;
CREATE TRIGGER trg_notify_help_request AFTER INSERT ON public.help_requests
FOR EACH ROW EXECUTE FUNCTION public.notify_help_request();

CREATE OR REPLACE FUNCTION public.notify_session_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.notifications (user_id, kind, payload)
  VALUES (
    CASE WHEN auth.uid() = NEW.coach_id THEN NEW.student_id ELSE NEW.coach_id END,
    CASE WHEN TG_OP = 'INSERT' THEN 'session_scheduled' ELSE 'session_updated' END,
    jsonb_build_object('session_id', NEW.id, 'scheduled_at', NEW.scheduled_at, 'status', NEW.status)
  );
  RETURN NEW;
END; $$;
REVOKE EXECUTE ON FUNCTION public.notify_session_change() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_notify_session_change ON public.sessions;
CREATE TRIGGER trg_notify_session_change AFTER INSERT OR UPDATE ON public.sessions
FOR EACH ROW EXECUTE FUNCTION public.notify_session_change();

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.help_requests;
ALTER PUBLICATION supabase_realtime ADD TABLE public.sessions;
