DROP POLICY IF EXISTS "Users can view messages in their groups" ON public.messages;

CREATE POLICY "Users can view messages by role and membership"
ON public.messages
FOR SELECT
TO public
USING (
  is_admin()
  OR has_role_level(auth.uid(), 'member'::app_role)
  OR ((receiver_type = 'group'::text) AND is_group_member(auth.uid(), receiver_id))
  OR ((receiver_type = 'admin'::text) AND ((sender_id = auth.uid()) OR (receiver_id = auth.uid())))
);

DROP POLICY IF EXISTS "Users can view group members" ON public.group_members;

CREATE POLICY "Users can view group members by role and membership"
ON public.group_members
FOR SELECT
TO authenticated
USING (
  is_admin()
  OR has_role_level(auth.uid(), 'senior_member'::app_role)
  OR is_group_member(auth.uid(), group_id)
);

DROP POLICY IF EXISTS "Users can view groups" ON public.groups;

CREATE POLICY "Users can view groups by role and membership"
ON public.groups
FOR SELECT
TO authenticated
USING (
  is_admin()
  OR has_role_level(auth.uid(), 'senior_member'::app_role)
  OR is_group_member(auth.uid(), id)
);

DROP POLICY IF EXISTS "Privileged users can read all AI conversations" ON public.ai_conversations;

CREATE POLICY "Privileged users can read all AI conversations"
ON public.ai_conversations
FOR SELECT
TO authenticated
USING (
  is_admin()
  OR has_role_level(auth.uid(), 'sub_admin'::app_role)
);

DROP POLICY IF EXISTS "Privileged users can manage all issues" ON public.user_reported_issues;

CREATE POLICY "Privileged users can manage all issues"
ON public.user_reported_issues
FOR ALL
TO public
USING (
  is_admin()
  OR has_role_level(auth.uid(), 'sub_admin'::app_role)
)
WITH CHECK (
  is_admin()
  OR has_role_level(auth.uid(), 'sub_admin'::app_role)
);

DROP POLICY IF EXISTS "Admins read all actions" ON public.astrabot_actions;

CREATE POLICY "Privileged users can read admin actions"
ON public.astrabot_actions
FOR SELECT
TO authenticated
USING (
  is_admin()
  OR has_role_level(auth.uid(), 'sub_admin'::app_role)
);