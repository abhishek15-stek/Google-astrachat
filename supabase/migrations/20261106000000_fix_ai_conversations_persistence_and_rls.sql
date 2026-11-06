-- ════════════════════════════════════════════════════════════════════════════
-- PERMANENT FIX: ASTRACHAT AI CONVERSATIONS PERSISTENCE, SCHEMA & RLS POLICIES
-- Preserves all existing data in public.ai_conversations while adding:
-- 1. Explicit table GRANTs for authenticated and service_role
-- 2. Complete per-operation RLS policies with strict user_id = (SELECT auth.uid()) isolation
-- 3. Multi-conversation support (conversation_id, title, personality)
-- 4. Separate error tracking (status, error_message) and idempotency (client_message_id, metadata)
-- 5. High-performance descending composite indexes for latest-first pagination
-- ════════════════════════════════════════════════════════════════════════════

-- 1. Safely extend public.ai_conversations without modifying or deleting existing records
ALTER TABLE public.ai_conversations
  ADD COLUMN IF NOT EXISTS conversation_id TEXT NOT NULL DEFAULT 'default',
  ADD COLUMN IF NOT EXISTS title TEXT,
  ADD COLUMN IF NOT EXISTS personality TEXT NOT NULL DEFAULT 'assistant',
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'sent',
  ADD COLUMN IF NOT EXISTS error_message TEXT,
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS client_message_id TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- 2. Ensure explicit table-level privileges (fixes silent permission denied failures)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_conversations TO authenticated;
GRANT ALL ON public.ai_conversations TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.feedback_requests TO authenticated;
GRANT ALL ON public.feedback_requests TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.feedback_responses TO authenticated;
GRANT ALL ON public.feedback_responses TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_reported_issues TO authenticated;
GRANT ALL ON public.user_reported_issues TO service_role;

-- 3. Ensure RLS is enabled on public.ai_conversations
ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;

-- 4. Replace fragmented policies on public.ai_conversations with explicit, isolated per-operation policies
DROP POLICY IF EXISTS "Users can manage their own AI conversations" ON public.ai_conversations;
DROP POLICY IF EXISTS "Admins can read all AI conversations" ON public.ai_conversations;
DROP POLICY IF EXISTS "Privileged users can read all AI conversations" ON public.ai_conversations;
DROP POLICY IF EXISTS "Users can select own AI conversations" ON public.ai_conversations;
DROP POLICY IF EXISTS "Users can insert own AI conversations" ON public.ai_conversations;
DROP POLICY IF EXISTS "Users can update own AI conversations" ON public.ai_conversations;
DROP POLICY IF EXISTS "Users can delete own AI conversations" ON public.ai_conversations;

-- SELECT: Every authenticated user can read their own AI conversations; admins/sub_admins can inspect for dashboard
CREATE POLICY "Users can select own AI conversations"
  ON public.ai_conversations
  FOR SELECT
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR public.is_admin()
    OR public.has_role_level((SELECT auth.uid()), 'sub_admin'::public.app_role)
  );

-- INSERT: Every authenticated user can insert their own AI messages
CREATE POLICY "Users can insert own AI conversations"
  ON public.ai_conversations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
  );

-- UPDATE: Every authenticated user can update their own AI messages (e.g. error state or retry metadata)
CREATE POLICY "Users can update own AI conversations"
  ON public.ai_conversations
  FOR UPDATE
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
  )
  WITH CHECK (
    user_id = (SELECT auth.uid())
  );

-- DELETE: Every authenticated user can delete their own AI conversations when explicitly requested
CREATE POLICY "Users can delete own AI conversations"
  ON public.ai_conversations
  FOR DELETE
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
  );

-- 5. Indexes for latest-first retrieval, conversation switching, and idempotent message saving
CREATE INDEX IF NOT EXISTS idx_ai_conversations_user_created_desc
  ON public.ai_conversations (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_conversations_user_conv_created
  ON public.ai_conversations (user_id, conversation_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_conversations_user_client_msg
  ON public.ai_conversations (user_id, client_message_id)
  WHERE client_message_id IS NOT NULL;

-- 6. Enable Realtime on public.ai_conversations safely
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.ai_conversations;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
