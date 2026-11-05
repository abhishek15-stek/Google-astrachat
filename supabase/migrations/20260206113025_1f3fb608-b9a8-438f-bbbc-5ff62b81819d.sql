-- Create screen share sessions table for WebRTC signaling
CREATE TABLE public.screen_share_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  receiver_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'denied', 'ended')),
  offer jsonb,
  answer jsonb,
  ice_candidates jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  CONSTRAINT different_users CHECK (requester_id != receiver_id)
);

-- Enable RLS
ALTER TABLE public.screen_share_sessions ENABLE ROW LEVEL SECURITY;

-- Policies: Users can see sessions they're part of
CREATE POLICY "Users can view their own sessions"
ON public.screen_share_sessions
FOR SELECT
USING (requester_id = auth.uid() OR receiver_id = auth.uid());

-- Users can create sessions
CREATE POLICY "Users can create screen share requests"
ON public.screen_share_sessions
FOR INSERT
WITH CHECK (requester_id = auth.uid());

-- Users can update sessions they're part of
CREATE POLICY "Users can update their sessions"
ON public.screen_share_sessions
FOR UPDATE
USING (requester_id = auth.uid() OR receiver_id = auth.uid());

-- Enable Realtime for this table
ALTER PUBLICATION supabase_realtime ADD TABLE public.screen_share_sessions;