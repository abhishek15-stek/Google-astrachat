
-- Create user_reported_issues table for tracking problems users report to AI
CREATE TABLE public.user_reported_issues (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  user_name TEXT,
  user_email TEXT,
  category TEXT NOT NULL DEFAULT 'general',
  main_problem TEXT NOT NULL,
  detailed_explanation TEXT,
  action_taken TEXT,
  action_taken_by TEXT DEFAULT 'ai',
  user_feedback TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  priority TEXT DEFAULT 'medium',
  follow_up_count INTEGER DEFAULT 0,
  last_follow_up_at TIMESTAMP WITH TIME ZONE,
  resolved_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.user_reported_issues ENABLE ROW LEVEL SECURITY;

-- Admins can do everything
CREATE POLICY "Admins can manage all issues"
ON public.user_reported_issues
FOR ALL
USING (public.is_admin());

-- Users can view their own issues
CREATE POLICY "Users can view their own issues"
ON public.user_reported_issues
FOR SELECT
USING (user_id = auth.uid());

-- Users can update their own issues (for feedback)
CREATE POLICY "Users can update their own issues"
ON public.user_reported_issues
FOR UPDATE
USING (user_id = auth.uid());

-- System/AI can insert issues (via service role, but also allow authenticated users)
CREATE POLICY "Users can create their own issues"
ON public.user_reported_issues
FOR INSERT
WITH CHECK (user_id = auth.uid());

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION public.update_reported_issues_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_reported_issues_timestamp
BEFORE UPDATE ON public.user_reported_issues
FOR EACH ROW
EXECUTE FUNCTION public.update_reported_issues_updated_at();
