-- ════════════════════════════════════════════════════════════════════════════
-- PERFORMANCE OPTIMIZATION: INDEXES & OPTIMIZED RLS POLICIES
-- Target: High-throughput chat, sub-10ms queries, zero sequential scan stalls
-- ════════════════════════════════════════════════════════════════════════════

-- 1. MESSAGES TABLE INDEXES
-- Optimizes message retrieval for group and 1-on-1 conversations
CREATE INDEX IF NOT EXISTS idx_messages_receiver_composite 
  ON public.messages (receiver_type, receiver_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_sender_created 
  ON public.messages (sender_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_created_at 
  ON public.messages (created_at DESC);

-- 2. GROUP MEMBERS & ROLES INDEXES
-- Critical for fast RLS evaluation and membership lookups
CREATE INDEX IF NOT EXISTS idx_group_members_user_group 
  ON public.group_members (user_id, group_id);

CREATE INDEX IF NOT EXISTS idx_group_members_group_user 
  ON public.group_members (group_id, user_id);

CREATE INDEX IF NOT EXISTS idx_user_roles_user_role 
  ON public.user_roles (user_id, role);

CREATE INDEX IF NOT EXISTS idx_user_roles_role_admin 
  ON public.user_roles (role) 
  WHERE role = 'admin';

-- 3. PROFILES PRESENCE INDEX
-- Prevents full table scan on 60-second presence polling
CREATE INDEX IF NOT EXISTS idx_profiles_last_active 
  ON public.profiles (last_active DESC) 
  WHERE last_active IS NOT NULL;

-- 4. READ RECEIPTS & REACTIONS INDEXES
-- Optimizes per-message read tracking and reactions
CREATE INDEX IF NOT EXISTS idx_read_receipts_user_msg 
  ON public.read_receipts (user_id, message_id);

CREATE INDEX IF NOT EXISTS idx_read_receipts_message 
  ON public.read_receipts (message_id);

CREATE INDEX IF NOT EXISTS idx_message_reactions_message 
  ON public.message_reactions (message_id);

CREATE INDEX IF NOT EXISTS idx_message_reactions_user 
  ON public.message_reactions (user_id);

-- 5. CALLS & SCREEN SHARE INDEXES
-- Realtime signaling queries for incoming calls and screen share sessions
CREATE INDEX IF NOT EXISTS idx_calls_receiver_status 
  ON public.calls (receiver_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_calls_caller_status 
  ON public.calls (caller_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_screen_share_receiver_status 
  ON public.screen_share_sessions (receiver_id, status);

CREATE INDEX IF NOT EXISTS idx_screen_share_requester_status 
  ON public.screen_share_sessions (requester_id, status);

-- 6. USER STATUS & AI CONVERSATIONS
CREATE INDEX IF NOT EXISTS idx_user_status_active 
  ON public.user_status (expires_at DESC, user_id) 
  WHERE expires_at > now();

CREATE INDEX IF NOT EXISTS idx_ai_conversations_user_created 
  ON public.ai_conversations (user_id, created_at ASC);

-- ════════════════════════════════════════════════════════════════════════════
-- 7. OPTIMIZED RLS POLICIES FOR MESSAGES TABLE
-- Using (SELECT auth.uid()) InitPlan caching to avoid row-by-row re-evaluation
-- ════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Users can view messages in their groups" ON public.messages;
CREATE POLICY "Users can view messages in their groups"
  ON public.messages FOR SELECT
  TO authenticated
  USING (
    sender_id = (SELECT auth.uid()) OR
    (receiver_type = 'admin' AND (receiver_id = (SELECT auth.uid()) OR public.is_admin())) OR
    (receiver_type = 'group' AND EXISTS (
      SELECT 1 FROM public.group_members gm
      WHERE gm.group_id = messages.receiver_id AND gm.user_id = (SELECT auth.uid())
    )) OR
    public.is_admin()
  );

DROP POLICY IF EXISTS "Users can send messages to admin or their groups" ON public.messages;
CREATE POLICY "Users can send messages to admin or their groups"
  ON public.messages FOR INSERT
  TO authenticated
  WITH CHECK (
    sender_id = (SELECT auth.uid()) AND
    (
      receiver_type = 'admin' OR
      (receiver_type = 'group' AND EXISTS (
        SELECT 1 FROM public.group_members gm
        WHERE gm.group_id = messages.receiver_id AND gm.user_id = (SELECT auth.uid())
      ))
    )
  );

-- Optimize groups RLS
DROP POLICY IF EXISTS "Users can view groups they belong to" ON public.groups;
CREATE POLICY "Users can view groups they belong to"
  ON public.groups FOR SELECT
  TO authenticated
  USING (
    public.is_admin() OR
    EXISTS (
      SELECT 1 FROM public.group_members gm
      WHERE gm.group_id = groups.id AND gm.user_id = (SELECT auth.uid())
    )
  );
