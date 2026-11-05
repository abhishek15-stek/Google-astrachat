
-- AI memory: persistent facts/preferences/notes per user (and optionally about other users for admin notes)
CREATE TABLE public.ai_memory (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  subject_user_id UUID NOT NULL,
  kind TEXT NOT NULL DEFAULT 'fact',
  content TEXT NOT NULL,
  importance INTEGER NOT NULL DEFAULT 3,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_memory_user_importance ON public.ai_memory (user_id, importance DESC, updated_at DESC);
CREATE INDEX idx_ai_memory_subject ON public.ai_memory (subject_user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_memory TO authenticated;
GRANT ALL ON public.ai_memory TO service_role;

ALTER TABLE public.ai_memory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own memory"
ON public.ai_memory FOR ALL TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins read all memory"
ON public.ai_memory FOR SELECT TO authenticated
USING (public.is_admin());

CREATE POLICY "Admins manage all memory"
ON public.ai_memory FOR ALL TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE TRIGGER ai_memory_updated_at
BEFORE UPDATE ON public.ai_memory
FOR EACH ROW EXECUTE FUNCTION public.update_reported_issues_updated_at();

-- Audit log of all ASTRABOT autonomous/tool actions
CREATE TABLE public.astrabot_actions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  actor_user_id UUID,
  tool_name TEXT NOT NULL,
  input JSONB,
  output JSONB,
  success BOOLEAN NOT NULL DEFAULT true,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_astrabot_actions_created ON public.astrabot_actions (created_at DESC);
CREATE INDEX idx_astrabot_actions_actor ON public.astrabot_actions (actor_user_id);

GRANT SELECT ON public.astrabot_actions TO authenticated;
GRANT ALL ON public.astrabot_actions TO service_role;

ALTER TABLE public.astrabot_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read all actions"
ON public.astrabot_actions FOR SELECT TO authenticated
USING (public.is_admin() OR public.has_role_level(auth.uid(), 'sub_admin'::app_role));
