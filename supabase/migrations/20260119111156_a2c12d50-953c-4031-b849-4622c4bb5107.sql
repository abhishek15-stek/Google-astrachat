-- Add is_banned column to profiles for user banning
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS is_banned boolean NOT NULL DEFAULT false;

-- Create system_announcements table for broadcast messages
CREATE TABLE IF NOT EXISTS public.system_announcements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  target_type TEXT NOT NULL DEFAULT 'all', -- 'all', 'group', 'user'
  target_id UUID
);

-- Enable RLS
ALTER TABLE public.system_announcements ENABLE ROW LEVEL SECURITY;

-- Only admins can manage announcements
CREATE POLICY "Only admins can manage announcements"
ON public.system_announcements
FOR ALL
USING (is_admin());

-- Users can view active announcements meant for them
CREATE POLICY "Users can view active announcements"
ON public.system_announcements
FOR SELECT
USING (
  is_active = true AND
  (expires_at IS NULL OR expires_at > now()) AND
  (
    target_type = 'all' OR
    (target_type = 'user' AND target_id = auth.uid()) OR
    (target_type = 'group' AND is_group_member(auth.uid(), target_id))
  )
);

-- Add realtime for announcements
ALTER PUBLICATION supabase_realtime ADD TABLE public.system_announcements;