import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Video, VideoOff, PhoneOff, MoreHorizontal, Volume2, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface FloatingScreenShareProps {
  stream: MediaStream | null;
  onStop: () => void;
  label?: string;
}

/**
 * WhatsApp/Meet-style floating PIP bar shown while a screen share is active.
 * - Draggable anywhere on screen
 * - Mic toggle, camera toggle, speaker, more, end share (red)
 * - Auto-detaches when stream ends
 */
export function FloatingScreenShare({ stream, onStop, label = "Sharing screen" }: FloatingScreenShareProps) {
  const [pos, setPos] = useState({ x: 16, y: window.innerHeight - 120 });
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(false);
  const [speakerOn, setSpeakerOn] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const dragRef = useRef<{ dx: number; dy: number; dragging: boolean }>({ dx: 0, dy: 0, dragging: false });

  // Auto-end when stream ends (user clicks browser's "Stop sharing")
  useEffect(() => {
    if (!stream) return;
    const tracks = stream.getVideoTracks();
    const handler = () => onStop();
    tracks.forEach((t) => t.addEventListener("ended", handler));
    return () => tracks.forEach((t) => t.removeEventListener("ended", handler));
  }, [stream, onStop]);

  // Apply mic mute
  useEffect(() => {
    stream?.getAudioTracks().forEach((t) => (t.enabled = micOn));
  }, [stream, micOn]);

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture(e.pointerId);
    dragRef.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y, dragging: true };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current.dragging) return;
    const w = collapsed ? 56 : 320;
    const h = collapsed ? 56 : 70;
    const x = Math.min(Math.max(0, e.clientX - dragRef.current.dx), window.innerWidth - w);
    const y = Math.min(Math.max(0, e.clientY - dragRef.current.dy), window.innerHeight - h);
    setPos({ x, y });
  };
  const onPointerUp = () => {
    dragRef.current.dragging = false;
  };

  if (!stream) return null;

  if (collapsed) {
    return (
      <div
        style={{ left: pos.x, top: pos.y }}
        className="fixed z-[9999] h-14 w-14 rounded-full bg-black/90 text-white shadow-2xl border border-white/10 flex items-center justify-center cursor-grab active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onClick={() => setCollapsed(false)}
        title="Sharing screen — tap to expand"
      >
        <div className="relative">
          <Video className="h-6 w-6" />
          <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div
      style={{ left: pos.x, top: pos.y }}
      className="fixed z-[9999] select-none rounded-full bg-black/90 backdrop-blur text-white shadow-2xl border border-white/10 px-2 py-1.5 flex items-center gap-1"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <button className="h-9 w-9 rounded-full hover:bg-white/10 flex items-center justify-center" title="More">
        <MoreHorizontal className="h-4 w-4" />
      </button>
      <button
        className="h-9 w-9 rounded-full hover:bg-white/10 flex items-center justify-center"
        onClick={() => setCamOn((v) => !v)}
        title={camOn ? "Camera on" : "Camera off"}
      >
        {camOn ? <Video className="h-4 w-4" /> : <VideoOff className="h-4 w-4" />}
      </button>
      <button
        className="h-9 w-9 rounded-full hover:bg-white/10 flex items-center justify-center"
        onClick={() => setSpeakerOn((v) => !v)}
        title="Speaker"
      >
        <Volume2 className={cn("h-4 w-4", !speakerOn && "opacity-40")} />
      </button>
      <button
        className={cn(
          "h-9 w-9 rounded-full hover:bg-white/10 flex items-center justify-center",
          !micOn && "text-red-300"
        )}
        onClick={() => setMicOn((v) => !v)}
        title={micOn ? "Mute" : "Unmute"}
      >
        {micOn ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
      </button>
      <button
        className="h-9 w-9 rounded-full bg-red-600 hover:bg-red-700 flex items-center justify-center ml-1"
        onClick={onStop}
        title="Stop sharing"
      >
        <PhoneOff className="h-4 w-4" />
      </button>
      <button
        className="h-7 w-7 rounded-full hover:bg-white/10 flex items-center justify-center ml-0.5"
        onClick={() => setCollapsed(true)}
        title="Minimize"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
