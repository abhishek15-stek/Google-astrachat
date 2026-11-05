-- Create feedback_requests table for AI-generated feedback questions
CREATE TABLE public.feedback_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  question TEXT NOT NULL,
  question_type TEXT NOT NULL DEFAULT 'star_rating', -- 'star_rating', 'options', 'text'
  options JSONB, -- For clickable options like ["Ok", "Good", "Fine", "Great", "Excellent"]
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT (now() + interval '7 days'),
  is_answered BOOLEAN DEFAULT false,
  context TEXT -- What prompted this question (ai_chat, feature_usage, etc.)
);

-- Create feedback_responses table for user responses
CREATE TABLE public.feedback_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID REFERENCES public.feedback_requests(id) ON DELETE CASCADE NOT NULL,
  user_id UUID NOT NULL,
  star_rating INTEGER CHECK (star_rating >= 1 AND star_rating <= 5),
  selected_option TEXT,
  text_response TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create feedback_settings table for admin configuration
CREATE TABLE public.feedback_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key TEXT UNIQUE NOT NULL,
  setting_value JSONB NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_by UUID
);

-- Enable RLS
ALTER TABLE public.feedback_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies for feedback_requests
CREATE POLICY "Users can view their own feedback requests"
ON public.feedback_requests FOR SELECT
USING (user_id = auth.uid() OR is_admin());

CREATE POLICY "System can create feedback requests"
ON public.feedback_requests FOR INSERT
WITH CHECK (is_admin());

CREATE POLICY "Users can update their own requests"
ON public.feedback_requests FOR UPDATE
USING (user_id = auth.uid());

CREATE POLICY "Admins can delete feedback requests"
ON public.feedback_requests FOR DELETE
USING (is_admin());

-- RLS Policies for feedback_responses
CREATE POLICY "Users can view responses"
ON public.feedback_responses FOR SELECT
USING (user_id = auth.uid() OR is_admin());

CREATE POLICY "Users can submit their responses"
ON public.feedback_responses FOR INSERT
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can manage all responses"
ON public.feedback_responses FOR ALL
USING (is_admin());

-- RLS Policies for feedback_settings
CREATE POLICY "Only admins can manage settings"
ON public.feedback_settings FOR ALL
USING (is_admin());

CREATE POLICY "Everyone can view settings"
ON public.feedback_settings FOR SELECT
USING (true);

-- Insert default settings
INSERT INTO public.feedback_settings (setting_key, setting_value) VALUES
('feedback_interval_hours', '24'),
('enabled', 'true'),
('questions_per_session', '1');

-- Enable realtime for feedback
ALTER PUBLICATION supabase_realtime ADD TABLE public.feedback_requests;
ALTER PUBLICATION supabase_realtime ADD TABLE public.feedback_responses;