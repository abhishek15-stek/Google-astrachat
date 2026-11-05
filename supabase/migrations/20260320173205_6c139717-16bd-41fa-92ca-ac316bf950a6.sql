-- Allow admins to read all AI conversations (for dashboard + AI agent reading user chats)
CREATE POLICY "Admins can read all AI conversations"
  ON public.ai_conversations
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

-- Allow users to delete their own messages (for delete-for-me feature)
CREATE POLICY "Users can delete their own messages"
  ON public.messages
  FOR DELETE
  TO public
  USING (sender_id = auth.uid());