-- Add typing_status table for real-time typing indicators
CREATE TABLE public.typing_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  thread_type text NOT NULL CHECK (thread_type IN ('admin', 'group')),
  thread_id uuid NOT NULL,
  is_typing boolean NOT NULL DEFAULT false,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(user_id, thread_type, thread_id)
);

-- Enable RLS on typing_status
ALTER TABLE public.typing_status ENABLE ROW LEVEL SECURITY;

-- Users can update their own typing status
CREATE POLICY "Users can manage their typing status"
ON public.typing_status
FOR ALL
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Users can view typing status in their threads
CREATE POLICY "Users can view typing in their threads"
ON public.typing_status
FOR SELECT
USING (
  is_admin() OR
  (thread_type = 'group' AND is_group_member(auth.uid(), thread_id)) OR
  (thread_type = 'admin')
);

-- Enable realtime for typing_status
ALTER PUBLICATION supabase_realtime ADD TABLE public.typing_status;