import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  Phone,
  PhoneOff,
  PhoneIncoming,
  Mic,
  MicOff,
  Video,
  VideoOff,
  Maximize2,
  Minimize2,
  GripVertical,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

// ═══════════════════════════════════════════════
// INCOMING CALL SCREEN
// ═══════════════════════════════════════════════
interface IncomingCallProps {
  callerName: string;
  callType: 'voice' | 'video';
  onAccept: () => void;
  onReject: () => void;
}

export function IncomingCallScreen({ callerName, callType, onAccept, onReject }: IncomingCallProps) {
  return (
    <Dialog open onOpenChange={onReject}>
      <DialogContent className="sm:max-w-sm border-0 bg-gradient-to-b from-card to-background shadow-2xl">
        <div className="flex flex-col items-center gap-6 py-8">
          <div className="relative">
            <motion.div
              animate={{ scale: [1, 1.4, 1], opacity: [0.4, 0, 0.4] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="absolute inset-0 rounded-full bg-primary/20"
              style={{ width: 120, height: 120, top: -20, left: -20 }}
            />
            <motion.div
              animate={{ scale: [1, 1.2, 1], opacity: [0.6, 0.1, 0.6] }}
              transition={{ duration: 2, repeat: Infinity, delay: 0.3 }}
              className="absolute inset-0 rounded-full bg-primary/30"
              style={{ width: 100, height: 100, top: -10, left: -10 }}
            />
            <Avatar className="h-20 w-20 border-4 border-primary/30">
              <AvatarFallback className="text-2xl bg-gradient-to-br from-primary to-accent text-primary-foreground font-bold">
                {callerName[0]?.toUpperCase() || '?'}
              </AvatarFallback>
            </Avatar>
          </div>

          <div className="text-center">
            <h3 className="text-xl font-bold">{callerName}</h3>
            <p className="text-muted-foreground text-sm mt-1">
              Incoming {callType} call...
            </p>
          </div>

          <motion.div
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 1.5, repeat: Infinity }}
            className="flex items-center gap-2 text-sm text-muted-foreground"
          >
            <PhoneIncoming className="h-4 w-4" />
            Ringing...
          </motion.div>

          <div className="flex gap-8">
            <div className="flex flex-col items-center gap-2">
              <motion.div whileTap={{ scale: 0.9 }}>
                <Button
                  variant="destructive"
                  size="icon"
                  onClick={onReject}
                  className="h-16 w-16 rounded-full shadow-lg"
                >
                  <PhoneOff className="h-6 w-6" />
                </Button>
              </motion.div>
              <span className="text-xs text-muted-foreground">Decline</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <motion.div
                whileTap={{ scale: 0.9 }}
                animate={{ scale: [1, 1.05, 1] }}
                transition={{ duration: 1, repeat: Infinity }}
              >
                <Button
                  size="icon"
                  onClick={onAccept}
                  className="h-16 w-16 rounded-full bg-green-500 hover:bg-green-600 shadow-lg shadow-green-500/30"
                >
                  <Phone className="h-6 w-6" />
                </Button>
              </motion.div>
              <span className="text-xs text-muted-foreground">Accept</span>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ═══════════════════════════════════════════════
// OUTGOING CALL SCREEN
// ═══════════════════════════════════════════════
interface OutgoingCallProps {
  receiverName: string;
  callType: 'voice' | 'video';
  onCancel: () => void;
}

export function OutgoingCallScreen({ receiverName, callType, onCancel }: OutgoingCallProps) {
  return (
    <Dialog open onOpenChange={onCancel}>
      <DialogContent className="sm:max-w-sm border-0 bg-gradient-to-b from-card to-background shadow-2xl">
        <div className="flex flex-col items-center gap-6 py-8">
          <motion.div
            animate={{ scale: [1, 1.1, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            <Avatar className="h-20 w-20 border-4 border-primary/20">
              <AvatarFallback className="text-2xl bg-gradient-to-br from-primary to-accent text-primary-foreground font-bold">
                {receiverName[0]?.toUpperCase() || '?'}
              </AvatarFallback>
            </Avatar>
          </motion.div>

          <div className="text-center">
            <h3 className="text-xl font-bold">{receiverName}</h3>
            <motion.p
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 1.5, repeat: Infinity }}
              className="text-muted-foreground text-sm mt-1"
            >
              Calling...
            </motion.p>
          </div>

          <div className="flex flex-col items-center gap-2">
            <Button
              variant="destructive"
              size="icon"
              onClick={onCancel}
              className="h-16 w-16 rounded-full shadow-lg"
            >
              <PhoneOff className="h-6 w-6" />
            </Button>
            <span className="text-xs text-muted-foreground">Cancel</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ═══════════════════════════════════════════════
// ACTIVE CALL WINDOW (floating, resizable, camera overlay)
// ═══════════════════════════════════════════════
interface ActiveCallProps {
  callType: 'voice' | 'video';
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  isMuted: boolean;
  isCameraOff: boolean;
  callDuration: number;
  formatDuration: (s: number) => string;
  peerName: string;
  onToggleMute: () => void;
  onToggleCamera: () => void;
  onEndCall: () => void;
}

const MIN_WIDTH = 280;
const MIN_HEIGHT = 180;
const MAX_WIDTH = 800;
const MAX_HEIGHT = 600;

export function ActiveCallWindow({
  callType,
  localStream,
  remoteStream,
  isMuted,
  isCameraOff,
  callDuration,
  formatDuration,
  peerName,
  onToggleMute,
  onToggleCamera,
  onEndCall,
}: ActiveCallProps) {
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isMinimized, setIsMinimized] = useState(false);
  const [size, setSize] = useState({ width: callType === 'video' ? 420 : 320, height: callType === 'video' ? 340 : 200 });
  const [isResizing, setIsResizing] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'reconnecting'>('connecting');

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
      setConnectionStatus('connected');
    }
  }, [remoteStream]);

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  // Connection status based on duration
  useEffect(() => {
    if (callDuration > 0) setConnectionStatus('connected');
  }, [callDuration]);

  const handleResize = useCallback((e: React.MouseEvent, direction: string) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    const startX = e.clientX;
    const startY = e.clientY;
    const startW = size.width;
    const startH = size.height;

    const onMouseMove = (ev: MouseEvent) => {
      let newW = startW;
      let newH = startH;
      if (direction.includes('e')) newW = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startW + (ev.clientX - startX)));
      if (direction.includes('w')) newW = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startW - (ev.clientX - startX)));
      if (direction.includes('s')) newH = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, startH + (ev.clientY - startY)));
      if (direction.includes('n')) newH = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, startH - (ev.clientY - startY)));
      setSize({ width: newW, height: newH });
    };

    const onMouseUp = () => {
      setIsResizing(false);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [size]);

  const handleDoubleClick = () => {
    if (size.width > 400) {
      setSize({ width: MIN_WIDTH, height: MIN_HEIGHT });
    } else {
      setSize({ width: MAX_WIDTH, height: MAX_HEIGHT });
    }
  };

  // Minimized pill
  if (isMinimized) {
    return (
      <motion.div
        drag
        dragMomentum={false}
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        className="fixed bottom-24 right-4 z-50 bg-card border border-border rounded-2xl shadow-2xl p-3 flex items-center gap-3 cursor-move"
      >
        <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center">
          {callType === 'video' ? <Video className="h-5 w-5 text-primary" /> : <Phone className="h-5 w-5 text-primary" />}
        </div>
        <div>
          <p className="text-sm font-semibold">{peerName}</p>
          <p className="text-xs text-green-500 font-mono">{formatDuration(callDuration)}</p>
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setIsMinimized(false)}>
          <Maximize2 className="h-4 w-4" />
        </Button>
        <Button variant="destructive" size="icon" className="h-8 w-8 rounded-full" onClick={onEndCall}>
          <PhoneOff className="h-4 w-4" />
        </Button>
      </motion.div>
    );
  }

  return (
    <AnimatePresence>
      <motion.div
        ref={containerRef}
        drag={!isResizing}
        dragMomentum={false}
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        onDoubleClick={handleDoubleClick}
        className="fixed z-50 bg-card border border-border rounded-2xl shadow-2xl overflow-hidden select-none"
        style={{
          width: size.width,
          height: size.height,
          bottom: 80,
          right: 20,
        }}
      >
        {/* Resize handles */}
        <div className="absolute top-0 left-0 w-2 h-full cursor-w-resize z-20" onMouseDown={(e) => handleResize(e, 'w')} />
        <div className="absolute top-0 right-0 w-2 h-full cursor-e-resize z-20" onMouseDown={(e) => handleResize(e, 'e')} />
        <div className="absolute bottom-0 left-0 w-full h-2 cursor-s-resize z-20" onMouseDown={(e) => handleResize(e, 's')} />
        <div className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize z-20" onMouseDown={(e) => handleResize(e, 'se')} />

        {/* Video area */}
        {callType === 'video' ? (
          <div className="relative w-full h-full bg-black">
            <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
            {/* Local camera overlay in corner */}
            {!isCameraOff && localStream && (
              <motion.div
                drag
                dragMomentum={false}
                dragConstraints={containerRef}
                className="absolute top-3 right-3 w-28 h-20 rounded-lg overflow-hidden border-2 border-background shadow-lg cursor-move z-10"
              >
                <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
              </motion.div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full bg-gradient-to-b from-primary/10 to-background gap-3 p-4">
            <Avatar className="h-16 w-16 border-2 border-primary/20">
              <AvatarFallback className="text-xl bg-gradient-to-br from-primary to-accent text-primary-foreground font-bold">
                {peerName[0]?.toUpperCase() || '?'}
              </AvatarFallback>
            </Avatar>
            <p className="font-bold">{peerName}</p>
            <p className="text-sm text-green-500 font-mono">{formatDuration(callDuration)}</p>
            {/* Camera overlay for voice call if camera enabled */}
            {!isCameraOff && localStream && localStream.getVideoTracks().length > 0 && (
              <motion.div
                drag
                dragMomentum={false}
                dragConstraints={containerRef}
                className="absolute top-3 right-3 w-24 h-18 rounded-lg overflow-hidden border-2 border-background shadow-lg cursor-move"
              >
                <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
              </motion.div>
            )}
          </div>
        )}

        {/* Status badge */}
        <div className={cn(
          "absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium text-white z-10",
          connectionStatus === 'connected' ? 'bg-green-500/90' : 'bg-amber-500/90'
        )}>
          <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
          {connectionStatus === 'connected' ? formatDuration(callDuration) : 'Connecting...'}
        </div>

        {/* Minimize button */}
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-3 right-3 h-7 w-7 bg-background/50 backdrop-blur-sm rounded-full z-10"
          onClick={() => setIsMinimized(true)}
          style={{ right: !isCameraOff && callType === 'video' ? 140 : 12 }}
        >
          <Minimize2 className="h-3.5 w-3.5" />
        </Button>

        {/* Controls */}
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-background/90 backdrop-blur-sm rounded-full px-4 py-2 border border-border shadow-lg z-10">
          <Button
            variant={isMuted ? 'destructive' : 'secondary'}
            size="icon"
            onClick={onToggleMute}
            className="h-10 w-10 rounded-full"
          >
            {isMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </Button>
          <Button
            variant={isCameraOff ? 'destructive' : 'secondary'}
            size="icon"
            onClick={onToggleCamera}
            className="h-10 w-10 rounded-full"
          >
            {isCameraOff ? <VideoOff className="h-4 w-4" /> : <Video className="h-4 w-4" />}
          </Button>
          <Button
            variant="destructive"
            size="icon"
            onClick={onEndCall}
            className="h-12 w-12 rounded-full"
          >
            <PhoneOff className="h-5 w-5" />
          </Button>
        </div>

        {/* Mic/Camera indicators */}
        <div className="absolute bottom-16 left-1/2 -translate-x-1/2 flex gap-2 z-10">
          {isMuted && (
            <span className="bg-destructive/80 text-destructive-foreground text-[10px] px-2 py-0.5 rounded-full">
              Mic Off
            </span>
          )}
          {isCameraOff && (
            <span className="bg-destructive/80 text-destructive-foreground text-[10px] px-2 py-0.5 rounded-full">
              Camera Off
            </span>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
