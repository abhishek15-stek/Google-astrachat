
CREATE TABLE public.calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  caller_id uuid NOT NULL REFERENCES public.profiles(id),
  receiver_id uuid NOT NULL REFERENCES public.profiles(id),
  call_type text NOT NULL DEFAULT 'voice',
  status text NOT NULL DEFAULT 'ringing',
  offer jsonb,
  answer jsonb,
  ice_candidates jsonb DEFAULT '[]'::jsonb,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.calls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can create calls" ON public.calls
  FOR INSERT TO public
  WITH CHECK (caller_id = auth.uid());

CREATE POLICY "Users can view their calls" ON public.calls
  FOR SELECT TO public
  USING (caller_id = auth.uid() OR receiver_id = auth.uid());

CREATE POLICY "Users can update their calls" ON public.calls
  FOR UPDATE TO public
  USING (caller_id = auth.uid() OR receiver_id = auth.uid());

ALTER PUBLICATION supabase_realtime ADD TABLE public.calls;
