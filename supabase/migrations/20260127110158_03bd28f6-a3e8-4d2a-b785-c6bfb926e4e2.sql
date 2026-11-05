-- Add message reactions table
CREATE TABLE public.message_reactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id UUID NOT NULL,
  user_id UUID NOT NULL,
  emoji TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(message_id, user_id, emoji)
);

-- Add read receipts table
CREATE TABLE public.read_receipts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id UUID NOT NULL,
  user_id UUID NOT NULL,
  read_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(message_id, user_id)
);

-- Add user status/stories table
CREATE TABLE public.user_status (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  content TEXT,
  media_url TEXT,
  media_type TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + interval '24 hours')
);

-- Add chat themes/wallpaper preferences table
CREATE TABLE public.user_preferences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  chat_wallpaper TEXT DEFAULT 'default',
  chat_theme TEXT DEFAULT 'default',
  notification_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add AI conversation history table
CREATE TABLE public.ai_conversations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.read_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;

-- RLS Policies for message_reactions
CREATE POLICY "Users can add reactions"
ON public.message_reactions FOR INSERT
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can remove their reactions"
ON public.message_reactions FOR DELETE
USING (user_id = auth.uid());

CREATE POLICY "Users can view reactions"
ON public.message_reactions FOR SELECT
USING (true);

-- RLS Policies for read_receipts
CREATE POLICY "Users can mark messages as read"
ON public.read_receipts FOR INSERT
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can view read receipts"
ON public.read_receipts FOR SELECT
USING (true);

-- RLS Policies for user_status
CREATE POLICY "Users can create their own status"
ON public.user_status FOR INSERT
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own status"
ON public.user_status FOR UPDATE
USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own status"
ON public.user_status FOR DELETE
USING (user_id = auth.uid());

CREATE POLICY "Users can view active statuses"
ON public.user_status FOR SELECT
USING (expires_at > now());

-- RLS Policies for user_preferences
CREATE POLICY "Users can manage their own preferences"
ON public.user_preferences FOR ALL
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- RLS Policies for ai_conversations
CREATE POLICY "Users can manage their own AI conversations"
ON public.ai_conversations FOR ALL
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Enable realtime for reactions and read receipts
ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reactions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.read_receipts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_status;