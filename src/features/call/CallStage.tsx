import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Mic, MicOff, Video, VideoOff, PhoneOff, Monitor, MonitorOff,
  Minimize2, Maximize2, Captions, CaptionsOff, Sparkles, Send,
  LayoutGrid, User, Eye, Signal, X, Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useCallAI } from '@/hooks/useCallAI';

type Layout = 'speaker' | 'gallery' | 'presenter';

interface Props {
  callType: 'voice' | 'video';
  callId: string | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  localScreenStream: MediaStream | null;
  remoteScreenStream: MediaStream | null;
  isMuted: boolean;
  isCameraOff: boolean;
  isSharingScreen: boolean;
  callDuration: number;
  formatDuration: (s: number) => string;
  peerName: string;
  rttMs: number | null;
  onToggleMute: () => void;
  onToggleCamera: () => void;
  onStartShare: () => void;
  onStopShare: () => void;
  onEndCall: () => void;
}

function Tile({ stream, label, muted = false, mirror = false, placeholderLetter, className }: {
  stream: MediaStream | null; label?: string; muted?: boolean; mirror?: boolean; placeholderLetter?: string; className?: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => { if (ref.current) ref.current.srcObject = stream; }, [stream]);
  const hasVideo = !!stream && stream.getVideoTracks().some((t) => t.enabled && t.readyState === 'live');
  return (
    <div className={cn('relative overflow-hidden rounded-2xl bg-black/80 ring-1 ring-white/10', className)}>
      {hasVideo ? (
        <video ref={ref} autoPlay playsInline muted={muted}
          className={cn('h-full w-full object-cover', mirror && 'scale-x-[-1]')} />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-800 to-slate-950">
          <Avatar className="h-20 w-20 ring-2 ring-white/20">
            <AvatarFallback className="bg-gradient-to-br from-primary to-accent text-2xl font-bold text-primary-foreground">
              {placeholderLetter?.toUpperCase() ?? '?'}
            </AvatarFallback>
          </Avatar>
        </div>
      )}
      {label && (
        <div className="absolute bottom-2 left-2 rounded-md bg-black/55 px-2 py-0.5 text-xs font-medium text-white backdrop-blur-sm">
          {label}
        </div>
      )}
    </div>
  );
}

export function CallStage(props: Props) {
  const {
    callType, callId, localStream, remoteStream, localScreenStream, remoteScreenStream,
    isMuted, isCameraOff, isSharingScreen, callDuration, formatDuration, peerName, rttMs,
    onToggleMute, onToggleCamera, onStartShare, onStopShare, onEndCall,
  } = props;

  const [minimized, setMinimized] = useState(false);
  const [layout, setLayout] = useState<Layout>('speaker');
  const [captions, setCaptions] = useState(false);
  const [screenReader, setScreenReader] = useState(true);
  const [showAI, setShowAI] = useState(false);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<string | null>(null);

  const screenStream = remoteScreenStream || localScreenStream;
  const hasScreen = !!screenStream;

  // Auto-promote to presenter layout when screen share starts
  useEffect(() => { if (hasScreen) setLayout('presenter'); }, [hasScreen]);

  const ai = useCallAI({
    callId,
    isInCall: true,
    localStream,
    localScreenStream,
    isSharingScreen,
    captionsEnabled: captions,
    screenReaderEnabled: screenReader,
    language: 'en',
  });

  const handleAsk = async () => {
    if (!question.trim()) return;
    setAnswer('…');
    const t = await ai.askAboutScreen(question);
    setAnswer(t || 'No answer.');
  };

  // ─────────── Minimized dock ───────────
  if (minimized) {
    return (
      <motion.div
        drag dragMomentum={false}
        initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }}
        className="fixed bottom-24 right-4 z-50 flex w-72 items-center gap-3 rounded-2xl border border-border bg-card/95 p-2 shadow-2xl backdrop-blur-xl"
      >
        <div className="h-14 w-20 overflow-hidden rounded-xl">
          <Tile stream={hasScreen ? screenStream : (remoteStream ?? localStream)} placeholderLetter={peerName[0]} muted />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{peerName}</p>
          <p className="font-mono text-xs text-emerald-500">{formatDuration(callDuration)}</p>
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setMinimized(false)}><Maximize2 className="h-4 w-4" /></Button>
        <Button variant="destructive" size="icon" className="h-8 w-8 rounded-full" onClick={onEndCall}><PhoneOff className="h-4 w-4" /></Button>
      </motion.div>
    );
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-gradient-to-br from-slate-950 via-slate-900 to-black text-white"
      >
        {/* Header */}
        <div className="absolute left-0 right-0 top-0 z-10 flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3 rounded-full bg-white/5 px-3 py-1.5 backdrop-blur-md ring-1 ring-white/10">
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
            <span className="text-sm font-medium">{peerName}</span>
            <span className="font-mono text-xs text-white/60">{formatDuration(callDuration)}</span>
            {rttMs !== null && (
              <span className="flex items-center gap-1 text-xs text-white/50">
                <Signal className="h-3 w-3" />{rttMs}ms
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {hasScreen && (
              <div className="hidden items-center gap-1 rounded-full bg-white/5 px-2 py-1 text-xs ring-1 ring-white/10 sm:flex">
                {(['speaker', 'gallery', 'presenter'] as Layout[]).map((l) => (
                  <button key={l} onClick={() => setLayout(l)}
                    className={cn('rounded-full px-2 py-0.5 capitalize transition', layout === l ? 'bg-primary text-primary-foreground' : 'text-white/60 hover:text-white')}
                  >{l === 'gallery' ? <LayoutGrid className="h-3.5 w-3.5" /> : l === 'speaker' ? <User className="h-3.5 w-3.5" /> : <Monitor className="h-3.5 w-3.5" />}</button>
                ))}
              </div>
            )}
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full bg-white/5 text-white hover:bg-white/10"
              onClick={() => setMinimized(true)}><Minimize2 className="h-4 w-4" /></Button>
          </div>
        </div>

        {/* Stage */}
        <div className="absolute inset-0 grid place-items-center px-4 pb-32 pt-16">
          {layout === 'presenter' && hasScreen ? (
            <div className="grid h-full w-full max-w-[1600px] grid-cols-1 gap-3 lg:grid-cols-[1fr_280px]">
              <Tile stream={screenStream} label={remoteScreenStream ? `${peerName}'s screen` : 'Your screen'} muted className="h-full min-h-0" />
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-1 lg:grid-rows-2">
                <Tile stream={remoteStream} label={peerName} placeholderLetter={peerName[0]} className="aspect-video lg:aspect-auto" />
                <Tile stream={localStream} label="You" placeholderLetter="Y" muted mirror className="aspect-video lg:aspect-auto" />
              </div>
            </div>
          ) : layout === 'gallery' ? (
            <div className="grid h-full w-full max-w-[1400px] grid-cols-1 gap-3 sm:grid-cols-2">
              <Tile stream={remoteStream} label={peerName} placeholderLetter={peerName[0]} className="aspect-video" />
              <Tile stream={localStream} label="You" placeholderLetter="Y" muted mirror className="aspect-video" />
              {hasScreen && <Tile stream={screenStream} label="Shared screen" muted className="aspect-video sm:col-span-2" />}
            </div>
          ) : (
            // Speaker
            <div className="relative h-full w-full max-w-[1400px]">
              <Tile stream={hasScreen ? screenStream : remoteStream} label={hasScreen ? 'Shared screen' : peerName} placeholderLetter={peerName[0]} muted={hasScreen} className="h-full" />
              <motion.div drag dragMomentum={false}
                className="absolute bottom-4 right-4 h-32 w-48 cursor-move sm:h-40 sm:w-60">
                <Tile stream={localStream} label="You" muted mirror placeholderLetter="Y" className="h-full" />
              </motion.div>
              {hasScreen && remoteStream && (
                <motion.div drag dragMomentum={false}
                  className="absolute bottom-4 left-4 h-32 w-48 cursor-move sm:h-40 sm:w-60">
                  <Tile stream={remoteStream} label={peerName} placeholderLetter={peerName[0]} className="h-full" />
                </motion.div>
              )}
            </div>
          )}
        </div>

        {/* Live captions band */}
        {captions && ai.latestCaption && (
          <motion.div initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
            className="pointer-events-none absolute bottom-28 left-1/2 z-10 max-w-2xl -translate-x-1/2 rounded-xl bg-black/70 px-4 py-2 text-center text-base font-medium shadow-lg backdrop-blur-md">
            {ai.latestCaption}
          </motion.div>
        )}

        {/* AI sidebar */}
        <AnimatePresence>
          {showAI && (
            <motion.aside
              initial={{ x: 360, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 360, opacity: 0 }}
              className="absolute right-0 top-0 z-20 flex h-full w-[340px] max-w-[90vw] flex-col border-l border-white/10 bg-slate-950/95 backdrop-blur-xl"
            >
              <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                <div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /><span className="text-sm font-semibold">AI assistant</span></div>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowAI(false)}><X className="h-4 w-4" /></Button>
              </div>

              <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2 text-xs">
                <button onClick={() => setCaptions((v) => !v)} className={cn('flex items-center gap-1.5 rounded-full px-2 py-1 ring-1 ring-white/10', captions ? 'bg-primary/20 text-primary' : 'text-white/60')}>
                  {captions ? <Captions className="h-3 w-3" /> : <CaptionsOff className="h-3 w-3" />} Captions
                </button>
                <button onClick={() => setScreenReader((v) => !v)} className={cn('flex items-center gap-1.5 rounded-full px-2 py-1 ring-1 ring-white/10', screenReader ? 'bg-primary/20 text-primary' : 'text-white/60')}>
                  <Eye className="h-3 w-3" /> Screen
                </button>
              </div>

              <ScrollArea className="flex-1 px-3 py-2">
                {ai.transcript.length === 0 && (
                  <p className="px-1 py-6 text-center text-xs text-white/40">
                    Turn on captions or share your screen to see live AI insight.
                  </p>
                )}
                <div className="space-y-2">
                  {ai.transcript.map((row) => (
                    <div key={row.id} className={cn('rounded-lg px-3 py-2 text-sm leading-snug ring-1',
                      row.kind === 'screen' ? 'bg-amber-500/10 text-amber-200 ring-amber-400/20' :
                      row.kind === 'summary' ? 'bg-primary/10 text-primary-foreground ring-primary/30' :
                      'bg-white/5 text-white/85 ring-white/10')}>
                      <div className="mb-0.5 flex items-center gap-1 text-[10px] uppercase tracking-wider text-white/40">
                        {row.kind === 'screen' ? <Eye className="h-2.5 w-2.5" /> : row.kind === 'summary' ? <Sparkles className="h-2.5 w-2.5" /> : <Mic className="h-2.5 w-2.5" />}
                        {row.kind}
                      </div>
                      {row.text}
                    </div>
                  ))}
                </div>
              </ScrollArea>

              {hasScreen && (
                <div className="border-t border-white/10 p-3">
                  <p className="mb-2 text-xs text-white/50">Ask AI about the shared screen</p>
                  <div className="flex gap-2">
                    <Input value={question} onChange={(e) => setQuestion(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleAsk()}
                      placeholder="e.g. what does this code do?"
                      className="h-9 border-white/10 bg-white/5 text-sm text-white placeholder:text-white/30" />
                    <Button size="icon" className="h-9 w-9" onClick={handleAsk} disabled={ai.busyAsk}>
                      {ai.busyAsk ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    </Button>
                  </div>
                  {answer && (
                    <div className="mt-2 max-h-40 overflow-auto rounded-lg bg-primary/10 px-3 py-2 text-sm text-white/90 ring-1 ring-primary/30">
                      {answer}
                    </div>
                  )}
                </div>
              )}
            </motion.aside>
          )}
        </AnimatePresence>

        {/* Controls */}
        <div className="absolute bottom-6 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/10 bg-black/70 px-3 py-2 shadow-2xl backdrop-blur-2xl">
          <ControlBtn active={!isMuted} onClick={onToggleMute} danger={isMuted}>
            {isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
          </ControlBtn>
          {callType === 'video' && (
            <ControlBtn active={!isCameraOff} onClick={onToggleCamera} danger={isCameraOff}>
              {isCameraOff ? <VideoOff className="h-5 w-5" /> : <Video className="h-5 w-5" />}
            </ControlBtn>
          )}
          <ControlBtn active={isSharingScreen} onClick={isSharingScreen ? onStopShare : onStartShare}>
            {isSharingScreen ? <MonitorOff className="h-5 w-5" /> : <Monitor className="h-5 w-5" />}
          </ControlBtn>
          <ControlBtn active={captions} onClick={() => setCaptions((v) => !v)}>
            {captions ? <Captions className="h-5 w-5" /> : <CaptionsOff className="h-5 w-5" />}
          </ControlBtn>
          <ControlBtn active={showAI} onClick={() => setShowAI((v) => !v)}>
            <Sparkles className="h-5 w-5" />
          </ControlBtn>
          <div className="mx-1 h-8 w-px bg-white/10" />
          <Button variant="destructive" size="icon" className="h-12 w-14 rounded-full" onClick={onEndCall}>
            <PhoneOff className="h-5 w-5" />
          </Button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

function ControlBtn({ children, active, danger, onClick }: { children: React.ReactNode; active?: boolean; danger?: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className={cn(
        'flex h-11 w-11 items-center justify-center rounded-full transition',
        danger ? 'bg-destructive text-destructive-foreground' :
        active ? 'bg-primary text-primary-foreground' :
        'bg-white/10 text-white hover:bg-white/20'
      )}
    >{children}</button>
  );
}
