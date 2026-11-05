CREATE TABLE public.call_transcripts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id uuid NOT NULL,
  speaker_id uuid,
  text text NOT NULL,
  lang text DEFAULT 'en',
  kind text NOT NULL DEFAULT 'line',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_call_transcripts_call ON public.call_transcripts(call_id, created_at);

GRANT SELECT ON public.call_transcripts TO authenticated;
GRANT ALL ON public.call_transcripts TO service_role;

ALTER TABLE public.call_transcripts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Call participants can read transcripts"
ON public.call_transcripts FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.calls c
    WHERE c.id = call_transcripts.call_id
      AND (c.caller_id = auth.uid() OR c.receiver_id = auth.uid())
  )
);

ALTER PUBLICATION supabase_realtime ADD TABLE public.call_transcripts;