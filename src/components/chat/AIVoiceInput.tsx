import React, { useState, useRef, useEffect } from 'react';
import { Mic, Square, Send, X, Play, Pause, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';

interface AIVoiceInputProps {
  onVoiceSend: (audioUrl: string, duration: number) => void;
  onCancel: () => void;
  isOpen: boolean;
}

export function AIVoiceInput({ onVoiceSend, onCancel, isOpen }: AIVoiceInputProps) {
  const { user } = useAuth();
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    return () => {
      cleanup();
    };
  }, []);

  useEffect(() => {
    if (isOpen && !isRecording && !audioBlob) {
      startRecording();
    }
  }, [isOpen]);

  const cleanup = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);

      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch (error) {
      console.error('Error accessing microphone:', error);
      onCancel();
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    }
  };

  const playPauseAudio = () => {
    if (!audioRef.current || !audioUrl) return;

    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleSend = async () => {
    if (!audioBlob || !user) return;

    setIsUploading(true);

    try {
      const fileName = `${user.id}/ai_voice_${Date.now()}.webm`;
      
      const { data: uploadData, error } = await supabase.storage
        .from('chat-attachments')
        .upload(fileName, audioBlob);

      if (error) throw error;

      const { data: { publicUrl } } = supabase.storage
        .from('chat-attachments')
        .getPublicUrl(uploadData.path);

      onVoiceSend(publicUrl, recordingTime);
      handleCancel();
    } catch (error) {
      console.error('Error uploading voice message:', error);
    } finally {
      setIsUploading(false);
    }
  };

  const handleCancel = () => {
    cleanup();
    setAudioBlob(null);
    setAudioUrl(null);
    setRecordingTime(0);
    setIsPlaying(false);
    setIsRecording(false);
    onCancel();
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (!isOpen) return null;

  return (
    <div className="flex items-center gap-2 p-3 bg-card border border-border rounded-xl animate-fade-in">
      {audioUrl && (
        <audio
          ref={audioRef}
          src={audioUrl}
          onEnded={() => setIsPlaying(false)}
          className="hidden"
        />
      )}

      {!audioBlob ? (
        // Recording state
        <>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleCancel}
            className="h-8 w-8"
          >
            <X className="h-4 w-4" />
          </Button>

          <div className="flex-1 flex items-center gap-3">
            <div className={cn(
              "h-3 w-3 rounded-full",
              isRecording ? "bg-red-500 animate-pulse" : "bg-muted"
            )} />
            <span className="text-sm font-mono">{formatTime(recordingTime)}</span>
            {isRecording && (
              <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-red-500 animate-pulse" style={{ width: '100%' }} />
              </div>
            )}
          </div>

          <Button
            onClick={isRecording ? stopRecording : startRecording}
            size="icon"
            className={cn(
              "h-10 w-10 rounded-full",
              isRecording ? "bg-red-500 hover:bg-red-600" : "bg-primary"
            )}
          >
            {isRecording ? (
              <Square className="h-4 w-4" />
            ) : (
              <Mic className="h-4 w-4" />
            )}
          </Button>
        </>
      ) : (
        // Review state
        <>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleCancel}
            className="h-8 w-8"
          >
            <X className="h-4 w-4" />
          </Button>

          <div className="flex-1 flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={playPauseAudio}
              className="h-8 w-8"
            >
              {isPlaying ? (
                <Pause className="h-4 w-4" />
              ) : (
                <Play className="h-4 w-4" />
              )}
            </Button>
            <span className="text-sm font-mono">{formatTime(recordingTime)}</span>
            <div className="flex-1 h-1 bg-muted rounded-full">
              <div className="h-full bg-primary rounded-full" style={{ width: '100%' }} />
            </div>
          </div>

          <Button
            onClick={handleSend}
            disabled={isUploading}
            size="icon"
            className="h-10 w-10 rounded-full bg-primary"
          >
            {isUploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </>
      )}
    </div>
  );
}
