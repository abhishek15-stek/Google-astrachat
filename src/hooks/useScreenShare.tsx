import { useState, useCallback, useEffect, useRef, createContext, useContext, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import type { Json } from '@/integrations/supabase/types';
import {
  buildDisplayMediaConstraints,
  getScreenShareDiagnostics,
  tryNativeScreenCapture,
} from '@/lib/screenShareDiagnostics';

interface ScreenShareSession {
  id: string;
  requester_id: string;
  receiver_id: string;
  status: 'pending' | 'accepted' | 'denied' | 'ended';
  offer?: RTCSessionDescriptionInit;
  answer?: RTCSessionDescriptionInit;
  ice_candidates?: RTCIceCandidateInit[];
  created_at: string;
  ended_at?: string;
}

interface ScreenShareState {
  isSharing: boolean;
  isViewing: boolean;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  sessionId: string | null;
  pendingRequest: ScreenShareSession | null;
}

interface ScreenShareContextType extends ScreenShareState {
  startShare: (targetUserId: string, options?: { audio?: boolean; video?: boolean }) => Promise<string | undefined>;
  acceptShare: (sessionId: string) => Promise<void>;
  denyShare: (sessionId: string) => Promise<void>;
  endShare: () => Promise<void>;
}

const defaultState: ScreenShareContextType = {
  isSharing: false,
  isViewing: false,
  localStream: null,
  remoteStream: null,
  sessionId: null,
  pendingRequest: null,
  startShare: async () => undefined,
  acceptShare: async () => {},
  denyShare: async () => {},
  endShare: async () => {},
};

const ScreenShareContext = createContext<ScreenShareContextType>(defaultState);

export function ScreenShareProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [state, setState] = useState<ScreenShareState>({
    isSharing: false,
    isViewing: false,
    localStream: null,
    remoteStream: null,
    sessionId: null,
    pendingRequest: null,
  });

  const peerConnection = useRef<RTCPeerConnection | null>(null);
  const iceCandidatesQueue = useRef<RTCIceCandidateInit[]>([]);
  const sessionIdRef = useRef<string | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const seenIce = useRef<Set<string>>(new Set());
  const endShareRef = useRef<() => Promise<void>>(() => Promise.resolve());

  // Keep refs in sync with state
  useEffect(() => {
    localStreamRef.current = state.localStream;
    sessionIdRef.current = state.sessionId;
  }, [state.localStream, state.sessionId]);

  // End screen share
  const endShare = useCallback(async () => {
    const stream = localStreamRef.current;
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
    }

    if (peerConnection.current) {
      peerConnection.current.close();
      peerConnection.current = null;
    }

    const currentSessionId = sessionIdRef.current;
    if (currentSessionId) {
      try {
        await supabase
          .from('screen_share_sessions')
          .update({ status: 'ended', ended_at: new Date().toISOString() })
          .eq('id', currentSessionId);
      } catch (e) {
        console.warn('Failed to update session end state:', e);
      }
    }

    setState({
      isSharing: false,
      isViewing: false,
      localStream: null,
      remoteStream: null,
      sessionId: null,
      pendingRequest: null,
    });
    sessionIdRef.current = null;
    localStreamRef.current = null;
    seenIce.current = new Set();
  }, []);

  useEffect(() => {
    endShareRef.current = endShare;
  }, [endShare]);

  // Create WebRTC peer connection
  const createPeerConnection = useCallback(() => {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ],
    });

    pc.onicecandidate = async (event) => {
      const activeSessionId = sessionIdRef.current;
      if (event.candidate && activeSessionId) {
        try {
          const candidate = { ...event.candidate.toJSON(), owner: user?.id } as RTCIceCandidateInit & { owner?: string };
          const { data: session } = await supabase
            .from('screen_share_sessions')
            .select('ice_candidates')
            .eq('id', activeSessionId)
            .single();

          const existingCandidates = (session?.ice_candidates as unknown as (RTCIceCandidateInit & { owner?: string })[]) || [];
          await supabase
            .from('screen_share_sessions')
            .update({
              ice_candidates: [...existingCandidates, candidate] as Json,
            })
            .eq('id', activeSessionId);
        } catch (err) {
          console.warn('Failed to save ICE candidate:', err);
        }
      }
    };

    pc.ontrack = (event) => {
      setState((prev) => ({ ...prev, remoteStream: event.streams[0] }));
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        endShareRef.current();
      }
    };

    peerConnection.current = pc;
    return pc;
  }, [user?.id]);

  // Start screen sharing (requester side)
  const startShare = useCallback(async (targetUserId: string, options?: { audio?: boolean; video?: boolean }) => {
    if (!user) return undefined;

    try {
      // 1) Try native (Capacitor) first — gives real full-screen capture on Android APK.
      let stream = await tryNativeScreenCapture();

      // 2) Fall back to browser getDisplayMedia with diagnostics-aware constraints.
      if (!stream) {
        const diag = await getScreenShareDiagnostics();
        console.log('[ScreenShare] Diagnostics:', diag);
        if (!diag.screenShareSupported) {
          throw new Error(diag.unsupportedReason || 'Screen sharing is not supported here.');
        }
        const constraints = buildDisplayMediaConstraints({ audio: options?.audio });
        stream = await navigator.mediaDevices.getDisplayMedia(constraints);
      }

      // Create session in database
      const { data: session, error } = await supabase
        .from('screen_share_sessions')
        .insert({
          requester_id: user.id,
          receiver_id: targetUserId,
          status: 'pending',
        })
        .select()
        .single();

      if (error || !session) {
        stream.getTracks().forEach((t) => t.stop());
        throw error || new Error('Failed to create session');
      }

      localStreamRef.current = stream;
      sessionIdRef.current = session.id;

      setState((prev) => ({
        ...prev,
        isSharing: true,
        localStream: stream,
        sessionId: session.id,
      }));

      // Create peer connection and offer
      const pc = createPeerConnection();
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      // Save offer to database
      await supabase
        .from('screen_share_sessions')
        .update({ offer: { type: offer.type, sdp: offer.sdp } as Json })
        .eq('id', session.id);

      // Handle stream ending
      stream.getVideoTracks()[0].onended = () => {
        endShareRef.current();
      };

      return session.id;
    } catch (error) {
      console.error('Failed to start screen share:', error);
      throw error;
    }
  }, [user, createPeerConnection]);

  // Accept incoming share request (receiver side)
  const acceptShare = useCallback(async (sessionId: string) => {
    if (!user) return;

    try {
      // Get the session with offer
      const { data: session, error } = await supabase
        .from('screen_share_sessions')
        .select('*')
        .eq('id', sessionId)
        .single();

      if (error || !session) throw error || new Error('Session not found');

      const pc = createPeerConnection();

      // Set remote description (offer)
      const offer = session.offer as unknown as RTCSessionDescriptionInit;
      await pc.setRemoteDescription(new RTCSessionDescription(offer));

      // Create and set answer
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      // Save answer and update status
      await supabase
        .from('screen_share_sessions')
        .update({
          status: 'accepted',
          answer: { type: answer.type, sdp: answer.sdp } as Json,
        })
        .eq('id', sessionId);

      // Process any queued ICE candidates
      for (const candidate of iceCandidatesQueue.current) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      }
      iceCandidatesQueue.current = [];

      sessionIdRef.current = sessionId;
      setState((prev) => ({
        ...prev,
        isViewing: true,
        sessionId,
        pendingRequest: null,
      }));
    } catch (error) {
      console.error('Failed to accept share:', error);
      throw error;
    }
  }, [user, createPeerConnection]);

  // Deny incoming share request
  const denyShare = useCallback(async (sessionId: string) => {
    try {
      await supabase
        .from('screen_share_sessions')
        .update({ status: 'denied' })
        .eq('id', sessionId);
    } catch (e) {
      console.warn('Failed to deny share in database:', e);
    }

    setState((prev) => ({ ...prev, pendingRequest: null }));
  }, []);

  // Listen for incoming share requests and session updates
  useEffect(() => {
    if (!user) return;

    const channelName = `screen-share-session-${user.id}`;
    const existing = supabase.getChannels().find((c) => c.topic === `realtime:${channelName}`);
    if (existing) {
      supabase.removeChannel(existing);
    }

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'screen_share_sessions',
        },
        async (payload) => {
          const session = payload.new as ScreenShareSession;

          // Handle incoming request (for receiver)
          if (payload.eventType === 'INSERT' && session.receiver_id === user.id && session.status === 'pending') {
            setState((prev) => ({ ...prev, pendingRequest: session }));
          }

          // Handle session acceptance (for requester) - complete WebRTC handshake
          if (payload.eventType === 'UPDATE' && session.requester_id === user.id && session.status === 'accepted' && session.answer) {
            if (peerConnection.current && peerConnection.current.signalingState !== 'stable') {
              const answer = session.answer as unknown as RTCSessionDescriptionInit;
              await peerConnection.current.setRemoteDescription(
                new RTCSessionDescription(answer)
              );
            }
          }

          // Handle denial
          if (payload.eventType === 'UPDATE' && session.requester_id === user.id && session.status === 'denied') {
            endShareRef.current();
          }

          // Handle ICE candidates
          if (payload.eventType === 'UPDATE' && session.ice_candidates && peerConnection.current) {
            const candidates = session.ice_candidates as unknown as RTCIceCandidateInit[];
            for (const candidate of candidates) {
              try {
                if (peerConnection.current.remoteDescription) {
                  await peerConnection.current.addIceCandidate(new RTCIceCandidate(candidate));
                } else {
                  iceCandidatesQueue.current.push(candidate);
                }
              } catch (e) {
                console.warn('Failed to add ICE candidate:', e);
              }
            }
          }

          // Handle session end
          if (payload.eventType === 'UPDATE' && session.status === 'ended') {
            if (session.requester_id === user.id || session.receiver_id === user.id) {
              endShareRef.current();
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  return (
    <ScreenShareContext.Provider
      value={{
        ...state,
        startShare,
        acceptShare,
        denyShare,
        endShare,
      }}
    >
      {children}
    </ScreenShareContext.Provider>
  );
}

export function useScreenShare(_receiverId?: string) {
  const context = useContext(ScreenShareContext);
  return context || defaultState;
}
