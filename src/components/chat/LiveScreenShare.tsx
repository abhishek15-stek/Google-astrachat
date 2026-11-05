import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Monitor,
  PhoneOff,
  Maximize2,
  X,
  Check,
  AlertCircle,
  AppWindow,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Smartphone,
  ShieldCheck,
  ShieldAlert,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Switch } from '@/components/ui/switch';
import { useScreenShare } from '@/hooks/useScreenShare';
import { motion, AnimatePresence } from 'framer-motion';
import { FloatingScreenShare } from '@/components/chat/FloatingScreenShare';
import { cn } from '@/lib/utils';
import {
  getScreenShareDiagnostics,
  type ScreenShareDiagnostics,
} from '@/lib/screenShareDiagnostics';

interface LiveScreenShareProps {
  receiverId?: string;
  receiverName?: string;
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Meet-style screen share entry point.
 *
 *   Pre-flight  →  Run diagnostics, show capability badges, surface real reason if unsupported.
 *   Picker      →  Show share-method tiles (Entire screen / Window / Tab / Device — Android note),
 *                  audio toggle, then hand off to the OS native picker via getDisplayMedia.
 *   Live        →  Floating draggable control bar over the whole app (FloatingScreenShare).
 *   Incoming    →  Accept / Decline card on the receiver side.
 *   Viewing     →  Modal video of remote stream (or use ScreenShareViewer for floating PIP).
 */
export function LiveScreenShare({ receiverId, receiverName, isOpen, onClose }: LiveScreenShareProps) {
  const {
    isSharing,
    isViewing,
    localStream,
    remoteStream,
    pendingRequest,
    startShare,
    acceptShare,
    denyShare,
    endShare,
  } = useScreenShare(receiverId);

  const [shareAudio, setShareAudio] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [diag, setDiag] = useState<ScreenShareDiagnostics | null>(null);
  const [showDiag, setShowDiag] = useState(false);
  const viewerRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (viewerRef.current && remoteStream) viewerRef.current.srcObject = remoteStream;
  }, [remoteStream]);

  // Refresh diagnostics whenever the dialog opens or user hits retry.
  const refreshDiag = useCallback(async () => {
    const d = await getScreenShareDiagnostics();
    setDiag(d);
  }, []);

  useEffect(() => {
    if (isOpen && !isSharing && !isViewing) {
      refreshDiag();
      setError(null);
    }
  }, [isOpen, isSharing, isViewing, refreshDiag]);

  const handleStart = async () => {
    if (!receiverId) {
      setError('Open a conversation first so AstraChat knows who to share with.');
      return;
    }
    setError(null);
    setStarting(true);
    try {
      await startShare(receiverId, { audio: shareAudio });
      onClose(); // collapse dialog – floating bar takes over
    } catch (e: any) {
      console.error('[ScreenShare] start failed', e);
      const name = e?.name || '';
      const msg = String(e?.message || e || '');
      if (name === 'NotAllowedError' || /Permission denied|permission/i.test(msg)) {
        setError('Permission denied. Tap "Share" in Chrome\'s prompt — if no prompt appeared, your browser blocked it for this site.');
      } else if (name === 'NotFoundError') {
        setError('No screen source was selected.');
      } else if (name === 'NotSupportedError' || /display-capture|disallowed/i.test(msg)) {
        setError('This browser/preview frame blocks screen capture. Open the published site (astrachat.lovable.app) in a new tab.');
      } else if (name === 'AbortError') {
        setError('Screen share was cancelled before a source was picked.');
      } else {
        setError(msg || 'Failed to start screen sharing.');
      }
      // Refresh diagnostics so the panel reflects the latest permission state.
      refreshDiag();
    } finally {
      setStarting(false);
    }
  };

  // ─────────── incoming request card ───────────
  if (pendingRequest && !isViewing) {
    return (
      <Dialog open={true} onOpenChange={() => denyShare(pendingRequest.id)}>
        <DialogContent className="sm:max-w-sm border-0 bg-gradient-to-b from-card to-background shadow-2xl">
          <div className="flex flex-col items-center gap-6 py-8">
            <div className="relative">
              <motion.div
                animate={{ scale: [1, 1.4, 1], opacity: [0.4, 0, 0.4] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="absolute rounded-full bg-primary/20"
                style={{ width: 120, height: 120, top: -20, left: -20 }}
              />
              <Avatar className="h-20 w-20 border-4 border-primary/30">
                <AvatarFallback className="bg-gradient-to-br from-primary to-accent text-primary-foreground">
                  <Monitor className="h-8 w-8" />
                </AvatarFallback>
              </Avatar>
            </div>
            <div className="text-center">
              <h3 className="text-xl font-bold">Incoming Screen Share</h3>
              <p className="text-muted-foreground text-sm mt-1">Someone wants to share their screen…</p>
            </div>
            <div className="flex gap-8">
              <div className="flex flex-col items-center gap-2">
                <Button variant="destructive" size="icon" onClick={() => denyShare(pendingRequest.id)} className="h-16 w-16 rounded-full">
                  <X className="h-6 w-6" />
                </Button>
                <span className="text-xs text-muted-foreground">Decline</span>
              </div>
              <div className="flex flex-col items-center gap-2">
                <Button size="icon" onClick={() => acceptShare(pendingRequest.id)} className="h-16 w-16 rounded-full bg-green-500 hover:bg-green-600">
                  <Check className="h-6 w-6" />
                </Button>
                <span className="text-xs text-muted-foreground">Accept</span>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const supported = diag?.screenShareSupported ?? true;
  const blockedReason = diag?.unsupportedReason ?? null;

  // ─────────── live: floating control bar ───────────
  return (
    <>
      {isSharing && localStream && (
        <FloatingScreenShare stream={localStream} onStop={() => { endShare(); onClose(); }} />
      )}

      {/* Meet-style picker dialog */}
      <Dialog open={isOpen && !isSharing && !isViewing} onOpenChange={(open) => { if (!open) onClose(); }}>
        <DialogContent className="sm:max-w-lg border-border/40 bg-card p-0 overflow-hidden rounded-2xl shadow-2xl">
          {/* Header */}
          <div className="flex items-center gap-3 px-6 pt-6 pb-4 border-b border-border/40">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Monitor className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-semibold leading-tight">Share your screen</h2>
              {receiverName && (
                <p className="text-xs text-muted-foreground truncate">
                  Sharing with <span className="font-medium text-foreground">{receiverName}</span>
                </p>
              )}
            </div>
            <span
              className={cn(
                'flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wider',
                supported
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                  : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
              )}
            >
              {supported ? <ShieldCheck className="h-3 w-3" /> : <ShieldAlert className="h-3 w-3" />}
              {supported ? 'Ready' : 'Check below'}
            </span>
          </div>

          <div className="px-6 py-5 space-y-4">
            {/* Method tiles — informational; browser shows the real picker after Continue */}
            <div className="grid grid-cols-3 gap-2">
              <MethodTile icon={<Monitor className="h-5 w-5" />} label="Entire screen" disabled={diag?.isAndroid && !diag?.isCapacitorNative} />
              <MethodTile icon={<AppWindow className="h-5 w-5" />} label="Window" disabled={diag?.isAndroid && !diag?.isCapacitorNative} />
              <MethodTile icon={<Smartphone className="h-5 w-5" />} label="Browser tab" />
            </div>
            {diag?.isAndroid && !diag.isCapacitorNative && (
              <p className="text-xs text-amber-600 dark:text-amber-400 leading-relaxed">
                On Android Chrome, only the current browser tab can be captured. For full-screen / app capture, install the AstraChat Android app.
              </p>
            )}

            {/* Audio toggle */}
            <div className="flex items-center justify-between rounded-xl border border-border/60 bg-muted/30 px-4 py-3">
              <div className="flex items-center gap-3">
                {shareAudio ? <Volume2 className="h-4 w-4 text-primary" /> : <VolumeX className="h-4 w-4 text-muted-foreground" />}
                <div>
                  <p className="text-sm font-medium">Share device audio</p>
                  <p className="text-xs text-muted-foreground">Desktop Chrome only — Android ignores this.</p>
                </div>
              </div>
              <Switch checked={shareAudio} onCheckedChange={setShareAudio} disabled={diag?.isAndroid} />
            </div>

            {/* Unsupported / error banner */}
            <AnimatePresence>
              {(error || (!supported && blockedReason)) && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className={cn(
                    'flex items-start gap-2 rounded-xl border px-3 py-2.5 text-sm',
                    error
                      ? 'border-destructive/40 bg-destructive/10 text-destructive'
                      : 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                  )}
                >
                  <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <span className="leading-snug">{error || blockedReason}</span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Diagnostics panel */}
            <button
              type="button"
              onClick={() => setShowDiag((v) => !v)}
              className="flex w-full items-center justify-between text-xs text-muted-foreground hover:text-foreground"
            >
              <span>Diagnostics &amp; compatibility</span>
              {showDiag ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
            <AnimatePresence>
              {showDiag && diag && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 rounded-xl border border-border/50 bg-muted/30 px-3 py-3 text-[11px] font-mono">
                    <DiagRow k="Browser" v={`${diag.browser} ${diag.browserVersion}`} />
                    <DiagRow k="Device" v={diag.device} />
                    {diag.androidVersion && <DiagRow k="Android" v={diag.androidVersion} />}
                    <DiagRow k="HTTPS" v={diag.isHttps ? 'yes' : 'no'} ok={diag.isHttps} />
                    <DiagRow k="In iframe" v={diag.isInIframe ? 'yes' : 'no'} ok={!diag.isInIframe} />
                    <DiagRow k="mediaDevices" v={diag.hasMediaDevices ? 'yes' : 'no'} ok={diag.hasMediaDevices} />
                    <DiagRow k="getDisplayMedia" v={diag.hasGetDisplayMedia ? 'yes' : 'no'} ok={diag.hasGetDisplayMedia} />
                    <DiagRow k="getUserMedia" v={diag.hasGetUserMedia ? 'yes' : 'no'} ok={diag.hasGetUserMedia} />
                    <DiagRow k="RTCPeerConnection" v={diag.hasRTCPeerConnection ? 'yes' : 'no'} ok={diag.hasRTCPeerConnection} />
                    <DiagRow k="Camera perm" v={diag.cameraPermission} />
                    <DiagRow k="Mic perm" v={diag.micPermission} />
                    <DiagRow k="Native app" v={diag.isCapacitorNative ? 'yes' : 'no'} />
                  </div>
                  <p className="mt-2 break-all rounded-lg bg-muted/20 px-2 py-1.5 text-[10px] text-muted-foreground/80">
                    {diag.userAgent}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between gap-2 border-t border-border/40 bg-muted/20 px-6 py-3">
            <Button variant="ghost" size="sm" onClick={refreshDiag} className="gap-1.5 text-muted-foreground">
              <RefreshCw className="h-3.5 w-3.5" />
              Re-check
            </Button>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={onClose} disabled={starting}>
                Cancel
              </Button>
              <Button onClick={handleStart} disabled={starting || !supported} className="gap-1.5">
                {starting ? 'Starting…' : 'Continue'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Viewer dialog – when receiving a share */}
      <Dialog open={isViewing && !!remoteStream} onOpenChange={(open) => { if (!open) endShare(); }}>
        <DialogContent className="sm:max-w-4xl p-0 overflow-hidden bg-black border-0">
          <div className="relative aspect-video bg-black">
            <video ref={viewerRef} autoPlay playsInline className="w-full h-full object-contain" />
            <div className="absolute top-4 left-4 flex items-center gap-2 bg-red-600 text-white px-3 py-1 rounded-full text-sm">
              <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
              Live
            </div>
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2">
              <Button variant="destructive" size="icon" onClick={endShare} className="h-12 w-12 rounded-full">
                <PhoneOff className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function MethodTile({ icon, label, disabled }: { icon: React.ReactNode; label: string; disabled?: boolean }) {
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-2 rounded-xl border px-2 py-3 text-center transition',
        disabled
          ? 'border-border/30 bg-muted/10 opacity-50'
          : 'border-border/60 bg-muted/30 hover:border-primary/50 hover:bg-primary/5'
      )}
    >
      <div className="text-foreground">{icon}</div>
      <span className="text-[11px] font-medium leading-tight">{label}</span>
    </div>
  );
}

function DiagRow({ k, v, ok }: { k: string; v: string; ok?: boolean }) {
  return (
    <>
      <span className="text-muted-foreground">{k}</span>
      <span
        className={cn(
          'truncate text-right',
          ok === true && 'text-emerald-600 dark:text-emerald-400',
          ok === false && 'text-amber-600 dark:text-amber-400'
        )}
      >
        {v}
      </span>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Standalone floating viewer (resizable PIP) for receiving screen shares
// ═══════════════════════════════════════════════════════════════════════
export function ScreenShareViewer() {
  const { isViewing, remoteStream, endShare } = useScreenShare();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [size, setSize] = useState({ width: 480, height: 270 });
  const [isMinimized, setIsMinimized] = useState(false);
  const [isResizing, setIsResizing] = useState(false);

  useEffect(() => {
    if (videoRef.current && remoteStream) videoRef.current.srcObject = remoteStream;
  }, [remoteStream]);

  const handleResize = useCallback((e: React.MouseEvent, direction: string) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    const startX = e.clientX, startY = e.clientY;
    const startW = size.width, startH = size.height;
    const onMove = (ev: MouseEvent) => {
      let w = startW, h = startH;
      if (direction.includes('e')) w = Math.min(900, Math.max(300, startW + ev.clientX - startX));
      if (direction.includes('s')) h = Math.min(600, Math.max(200, startH + ev.clientY - startY));
      setSize({ width: w, height: h });
    };
    const onUp = () => {
      setIsResizing(false);
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [size]);

  if (!isViewing || !remoteStream) return null;

  if (isMinimized) {
    return (
      <motion.div
        drag dragMomentum={false}
        initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
        className="fixed bottom-24 left-4 z-50 bg-card border border-border rounded-2xl shadow-2xl p-3 flex items-center gap-3 cursor-move"
      >
        <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center">
          <Monitor className="h-5 w-5 text-primary" />
        </div>
        <div>
          <p className="text-sm font-semibold">Screen Share</p>
          <p className="text-xs text-green-500">Live</p>
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setIsMinimized(false)}>
          <Maximize2 className="h-4 w-4" />
        </Button>
        <Button variant="destructive" size="icon" className="h-8 w-8 rounded-full" onClick={endShare}>
          <PhoneOff className="h-4 w-4" />
        </Button>
      </motion.div>
    );
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}
        drag={!isResizing} dragMomentum={false}
        className="fixed z-50 bg-background border border-border rounded-xl shadow-2xl overflow-hidden select-none"
        style={{ left: 20, top: 80, width: size.width, height: size.height }}
      >
        <div className="absolute right-0 top-0 w-2 h-full cursor-e-resize z-20" onMouseDown={(e) => handleResize(e, 'e')} />
        <div className="absolute bottom-0 left-0 w-full h-2 cursor-s-resize z-20" onMouseDown={(e) => handleResize(e, 's')} />
        <div className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize z-20" onMouseDown={(e) => handleResize(e, 'se')} />
        <video ref={videoRef} autoPlay playsInline className="w-full h-full object-contain bg-black" />
        <div className="absolute top-2 right-2 flex gap-1 z-30">
          <Button variant="secondary" size="icon" className="h-7 w-7 rounded-full" onClick={() => setIsMinimized(true)}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-30">
          <Button variant="destructive" size="sm" className="rounded-full gap-1.5" onClick={endShare}>
            <PhoneOff className="h-3.5 w-3.5" />
            End
          </Button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
