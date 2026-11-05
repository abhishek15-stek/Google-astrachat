import { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface TranscriptLine {
  id: string;
  text: string;
  speaker_id: string | null;
  kind: string;
  created_at: string;
}

interface UseCallAIOpts {
  callId: string | null;
  isInCall: boolean;
  localStream: MediaStream | null;
  localScreenStream: MediaStream | null;
  isSharingScreen: boolean;
  captionsEnabled: boolean;
  screenReaderEnabled: boolean;
  language: string; // 'en', 'es', etc.
}

/**
 * Streams microphone audio chunks (~4s) to the call-ai edge function for live transcription,
 * samples a frame from the shared screen every 6s for the AI screen-reader,
 * and subscribes to call_transcripts realtime so captions/notes appear live.
 */
export function useCallAI(opts: UseCallAIOpts) {
  const { callId, isInCall, localStream, localScreenStream, isSharingScreen, captionsEnabled, screenReaderEnabled, language } = opts;

  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [latestCaption, setLatestCaption] = useState<string>('');
  const [latestScreen, setLatestScreen] = useState<string>('');
  const [busyAsk, setBusyAsk] = useState(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const screenIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastFrameRef = useRef<string | null>(null);

  const callAI = useCallback(async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke('call-ai', { body: { callId, ...body } });
    if (error) { console.warn('call-ai error', error); return null; }
    return data as { text?: string };
  }, [callId]);

  // Realtime transcript feed
  useEffect(() => {
    if (!callId || !isInCall) { setTranscript([]); setLatestCaption(''); setLatestScreen(''); return; }
    let active = true;

    supabase.from('call_transcripts').select('*').eq('call_id', callId).order('created_at').then(({ data }) => {
      if (!active || !data) return;
      setTranscript(data as TranscriptLine[]);
    });

    const ch = supabase
      .channel(`transcripts-${callId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'call_transcripts', filter: `call_id=eq.${callId}` }, (payload) => {
        const row = payload.new as TranscriptLine;
        setTranscript((t) => [...t, row]);
        if (row.kind === 'line') setLatestCaption(row.text);
        if (row.kind === 'screen') setLatestScreen(row.text);
      })
      .subscribe();
    return () => { active = false; supabase.removeChannel(ch); };
  }, [callId, isInCall]);

  // Audio chunk recorder
  useEffect(() => {
    if (!isInCall || !captionsEnabled || !localStream) return;
    const audioOnly = new MediaStream(localStream.getAudioTracks());
    if (audioOnly.getAudioTracks().length === 0) return;

    let stopped = false;
    const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
    let rec: MediaRecorder;
    try {
      rec = new MediaRecorder(audioOnly, { mimeType: mime, audioBitsPerSecond: 24000 });
    } catch { return; }
    recorderRef.current = rec;

    rec.ondataavailable = async (ev) => {
      if (!ev.data || ev.data.size < 1500) return;
      const buf = await ev.data.arrayBuffer();
      const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
      callAI({ kind: 'caption', audioB64: b64, audioMime: 'webm', lang: language });
    };

    const loop = () => {
      if (stopped) return;
      try { rec.start(); } catch { return; }
      setTimeout(() => {
        if (rec.state === 'recording') rec.stop();
        if (!stopped) loop();
      }, 4500);
    };
    loop();

    return () => {
      stopped = true;
      try { if (rec.state !== 'inactive') rec.stop(); } catch {}
      recorderRef.current = null;
    };
  }, [isInCall, captionsEnabled, localStream, language, callAI]);

  // Screen-reader frame sampler
  useEffect(() => {
    if (!isInCall || !screenReaderEnabled || !isSharingScreen || !localScreenStream) return;
    const video = document.createElement('video');
    video.srcObject = localScreenStream;
    video.muted = true;
    video.play().catch(() => {});
    const canvas = document.createElement('canvas');

    const sample = async () => {
      if (video.videoWidth === 0) return;
      const w = Math.min(960, video.videoWidth);
      const h = Math.round((video.videoHeight / video.videoWidth) * w);
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, w, h);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
      const b64 = dataUrl.split(',')[1];
      lastFrameRef.current = b64;
      callAI({ kind: 'screen', frameB64: b64 });
    };

    screenIntervalRef.current = setInterval(sample, 6000);
    const t = setTimeout(sample, 1500);
    return () => {
      clearTimeout(t);
      if (screenIntervalRef.current) clearInterval(screenIntervalRef.current);
      screenIntervalRef.current = null;
      video.srcObject = null;
    };
  }, [isInCall, screenReaderEnabled, isSharingScreen, localScreenStream, callAI]);

  const askAboutScreen = useCallback(async (question: string) => {
    if (!lastFrameRef.current) return 'No screen frame available yet.';
    setBusyAsk(true);
    const res = await callAI({ kind: 'ask', frameB64: lastFrameRef.current, prompt: question });
    setBusyAsk(false);
    return res?.text ?? '';
  }, [callAI]);

  const generateSummary = useCallback(async () => {
    return callAI({ kind: 'summary' });
  }, [callAI]);

  return { transcript, latestCaption, latestScreen, askAboutScreen, generateSummary, busyAsk };
}
