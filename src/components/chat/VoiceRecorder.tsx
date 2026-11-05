import React, { useState, useRef, useEffect } from 'react';
import { Mic, Square, Send, X, Play, Pause } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';

interface VoiceRecorderProps {
  onSend: (audioUrl: string, duration: number) => void;
  onCancel: () => void;
}

export function VoiceRecorder({ onSend, onCancel }: VoiceRecorderProps) {
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
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
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
        
        // Stop all tracks
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);

      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch (error) {
      console.error('Error accessing microphone:', error);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
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
      const fileName = `${user.id}/voice_${Date.now()}.webm`;
      
      const { data: uploadData, error } = await supabase.storage
        .from('chat-attachments')
        .upload(fileName, audioBlob);

      if (error) throw error;

      const { data: { publicUrl } } = supabase.storage
        .from('chat-attachments')
        .getPublicUrl(uploadData.path);

      onSend(publicUrl, recordingTime);
      resetRecorder();
    } catch (error) {
      console.error('Error uploading voice message:', error);
    } finally {
      setIsUploading(false);
    }
  };

  const resetRecorder = () => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioBlob(null);
    setAudioUrl(null);
    setRecordingTime(0);
    setIsPlaying(false);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

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
            onClick={onCancel}
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
              isRecording ? "bg-red-500 hover:bg-red-600" : "btn-send"
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
            onClick={() => {
              resetRecorder();
              onCancel();
            }}
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
            className="h-10 w-10 rounded-full btn-send"
          >
            <Send className="h-4 w-4" />
          </Button>
        </>
      )}
    </div>
  );
}

// Voice message player component
interface VoiceMessageProps {
  audioUrl: string;
  duration?: number;
  isOwn?: boolean;
}

export function VoiceMessage({ audioUrl, duration = 0, isOwn }: VoiceMessageProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => {
      setProgress((audio.currentTime / audio.duration) * 100);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setProgress(0);
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
    };
  }, []);

  const togglePlay = () => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className={cn(
      "flex items-center gap-2 p-2 rounded-xl min-w-[180px]",
      isOwn ? "bg-primary/10" : "bg-muted"
    )}>
      <audio ref={audioRef} src={audioUrl} className="hidden" />
      
      <Button
        variant="ghost"
        size="icon"
        onClick={togglePlay}
        className="h-8 w-8 shrink-0"
      >
        {isPlaying ? (
          <Pause className="h-4 w-4" />
        ) : (
          <Play className="h-4 w-4" />
        )}
      </Button>

      <div className="flex-1">
        <div className="h-1.5 bg-muted-foreground/20 rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <span className="text-xs text-muted-foreground font-mono">
        {formatTime(duration)}
      </span>
    </div>
  );
}
