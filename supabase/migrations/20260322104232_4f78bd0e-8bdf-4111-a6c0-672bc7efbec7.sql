-- Update messages SELECT policy: sub_admin+ can see all
DROP POLICY IF EXISTS "Users can view messages in their groups" ON public.messages;
CREATE POLICY "Users can view messages in their groups" ON public.messages
FOR SELECT TO public
USING (
  is_admin()
  OR has_role_level(auth.uid(), 'sub_admin')
  OR ((receiver_type = 'group') AND is_group_member(auth.uid(), receiver_id))
  OR ((receiver_type = 'admin') AND (sender_id = auth.uid() OR receiver_id = auth.uid()))
);

-- Update messages INSERT: spectators cannot send
DROP POLICY IF EXISTS "Users can send messages to admin or their groups" ON public.messages;
CREATE POLICY "Users can send messages to admin or their groups" ON public.messages
FOR INSERT TO public
WITH CHECK (
  sender_id = auth.uid()
  AND NOT has_role(auth.uid(), 'spectator')
  AND (
    receiver_type = 'admin'
    OR (
      receiver_type = 'group'
      AND is_group_member(auth.uid(), receiver_id)
      AND (
        NOT EXISTS (SELECT 1 FROM groups WHERE id = messages.receiver_id AND is_broadcast = true)
        OR is_admin()
      )
    )
  )
);

-- Allow sub_admin+ to view all AI conversations
DROP POLICY IF EXISTS "Admins can read all AI conversations" ON public.ai_conversations;
CREATE POLICY "Privileged users can read all AI conversations" ON public.ai_conversations
FOR SELECT TO authenticated
USING (
  is_admin() OR has_role_level(auth.uid(), 'sub_admin')
);

-- Allow sub_admin+ to manage groups
DROP POLICY IF EXISTS "Only admins can create groups" ON public.groups;
CREATE POLICY "Admins and sub_admins can create groups" ON public.groups
FOR INSERT TO authenticated
WITH CHECK (is_admin() OR has_role_level(auth.uid(), 'sub_admin'));

DROP POLICY IF EXISTS "Only admins can delete groups" ON public.groups;
CREATE POLICY "Admins and sub_admins can delete groups" ON public.groups
FOR DELETE TO authenticated
USING (is_admin() OR has_role_level(auth.uid(), 'sub_admin'));

DROP POLICY IF EXISTS "Only admins can update groups" ON public.groups;
CREATE POLICY "Admins and sub_admins can update groups" ON public.groups
FOR UPDATE TO authenticated
USING (is_admin() OR has_role_level(auth.uid(), 'sub_admin'));

-- Sub_admin+ can manage group members
DROP POLICY IF EXISTS "Admins can insert group members" ON public.group_members;
CREATE POLICY "Privileged users can insert group members" ON public.group_members
FOR INSERT TO public
WITH CHECK (is_admin() OR has_role_level(auth.uid(), 'sub_admin'));

DROP POLICY IF EXISTS "Admins can delete group members" ON public.group_members;
CREATE POLICY "Privileged users can delete group members" ON public.group_members
FOR DELETE TO public
USING (is_admin() OR has_role_level(auth.uid(), 'sub_admin'));

-- Senior members+ can view all groups
DROP POLICY IF EXISTS "Users can view groups they belong to" ON public.groups;
CREATE POLICY "Users can view groups" ON public.groups
FOR SELECT TO authenticated
USING (
  is_admin()
  OR has_role_level(auth.uid(), 'senior_member')
  OR is_group_member(auth.uid(), id)
);

-- Senior members+ can view all group members
DROP POLICY IF EXISTS "Users can view group members of their groups" ON public.group_members;
CREATE POLICY "Users can view group members" ON public.group_members
FOR SELECT TO authenticated
USING (
  is_admin()
  OR has_role_level(auth.uid(), 'senior_member')
  OR is_group_member(auth.uid(), group_id)
);

-- Sub_admin+ can manage issues
DROP POLICY IF EXISTS "Admins can manage all issues" ON public.user_reported_issues;
CREATE POLICY "Privileged users can manage all issues" ON public.user_reported_issues
FOR ALL TO public
USING (is_admin() OR has_role_level(auth.uid(), 'sub_admin'));