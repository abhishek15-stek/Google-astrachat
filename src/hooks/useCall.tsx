import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import type { Json } from '@/integrations/supabase/types';

interface CallSession {
  id: string;
  caller_id: string;
  receiver_id: string;
  call_type: 'voice' | 'video';
  status: 'ringing' | 'accepted' | 'rejected' | 'ended' | 'missed';
  offer?: RTCSessionDescriptionInit;
  answer?: RTCSessionDescriptionInit;
  ice_candidates?: RTCIceCandidateInit[];
  started_at?: string;
  ended_at?: string;
  created_at: string;
}

interface CallState {
  isInCall: boolean;
  isCalling: boolean;
  isReceivingCall: boolean;
  callType: 'voice' | 'video' | null;
  callId: string | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  localScreenStream: MediaStream | null;
  remoteScreenStream: MediaStream | null;
  incomingCall: CallSession | null;
  isMuted: boolean;
  isCameraOff: boolean;
  isSharingScreen: boolean;
  isOnHold: boolean;
  callDuration: number;
  callerName: string | null;
  isCaller: boolean;
  rttMs: number | null;
}

const INITIAL: CallState = {
  isInCall: false,
  isCalling: false,
  isReceivingCall: false,
  callType: null,
  callId: null,
  localStream: null,
  remoteStream: null,
  localScreenStream: null,
  remoteScreenStream: null,
  incomingCall: null,
  isMuted: false,
  isCameraOff: false,
  isSharingScreen: false,
  isOnHold: false,
  callDuration: 0,
  callerName: null,
  isCaller: false,
  rttMs: null,
};

export function useCall() {
  const { user } = useAuth();
  const [state, setState] = useState<CallState>(INITIAL);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const callIdRef = useRef<string | null>(null);
  const isCallerRef = useRef(false);
  const iceQueue = useRef<RTCIceCandidateInit[]>([]);
  const seenIce = useRef<Set<string>>(new Set());
  const remoteCamTrackId = useRef<string | null>(null);
  const durationInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const statsInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const screenSenderRef = useRef<RTCRtpSender | null>(null);
  const screenAudioSenderRef = useRef<RTCRtpSender | null>(null);
  const localScreenRef = useRef<MediaStream | null>(null);
  const negotiationLock = useRef(false);
  const groupPeersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const groupScreenSendersRef = useRef<Map<string, RTCRtpSender[]>>(new Map());

  const startDuration = () => {
    if (durationInterval.current) return;
    durationInterval.current = setInterval(() => {
      setState((p) => ({ ...p, callDuration: p.callDuration + 1 }));
    }, 1000);
  };

  const startStats = (pc: RTCPeerConnection) => {
    if (statsInterval.current) clearInterval(statsInterval.current);
    statsInterval.current = setInterval(async () => {
      try {
        const stats = await pc.getStats();
        let rtt: number | null = null;
        stats.forEach((r: any) => {
          if (r.type === 'candidate-pair' && r.nominated && typeof r.currentRoundTripTime === 'number') {
            rtt = Math.round(r.currentRoundTripTime * 1000);
          }
        });
        if (rtt !== null) setState((p) => ({ ...p, rttMs: rtt }));
      } catch {}
    }, 3000);
  };

  const teardown = useCallback(() => {
    if (durationInterval.current) clearInterval(durationInterval.current);
    if (statsInterval.current) clearInterval(statsInterval.current);
    durationInterval.current = null;
    statsInterval.current = null;
    state.localStream?.getTracks().forEach((t) => t.stop());
    localScreenRef.current?.getTracks().forEach((t) => t.stop());
    localScreenRef.current = null;
    if (pcRef.current) {
      try { pcRef.current.close(); } catch {}
      pcRef.current = null;
    }
    groupPeersRef.current.forEach((pc) => { try { pc.close(); } catch {} });
    groupPeersRef.current.clear();
    groupScreenSendersRef.current.clear();
    screenSenderRef.current = null;
    screenAudioSenderRef.current = null;
    callIdRef.current = null;
    isCallerRef.current = false;
    iceQueue.current = [];
    seenIce.current = new Set();
    remoteCamTrackId.current = null;
    setState(INITIAL);
  }, [state.localStream]);

  const endCall = useCallback(async () => {
    const id = callIdRef.current;
    if (id) {
      await supabase.from('calls').update({ status: 'ended', ended_at: new Date().toISOString() }).eq('id', id);
    }
    for (const groupCallId of groupPeersRef.current.keys()) {
      await supabase.from('calls').update({ status: 'ended', ended_at: new Date().toISOString() }).eq('id', groupCallId);
    }
    teardown();
  }, [teardown]);

  // Send a renegotiation offer (caller-initiated). Receiver-initiated renegotiation is converted by passing through caller.
  const renegotiate = useCallback(async () => {
    const pc = pcRef.current;
    const id = callIdRef.current;
    if (!pc || !id || !isCallerRef.current) return;
    if (negotiationLock.current) return;
    negotiationLock.current = true;
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await supabase
        .from('calls')
        .update({ offer: { type: offer.type, sdp: offer.sdp } as Json, answer: null })
        .eq('id', id);
    } finally {
      setTimeout(() => { negotiationLock.current = false; }, 500);
    }
  }, []);

  const createPeerConnection = useCallback((callId: string, asCaller: boolean) => {
    callIdRef.current = callId;
    isCallerRef.current = asCaller;
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ],
    });

    pc.onicecandidate = async (event) => {
      if (!event.candidate) return;
      const cand = { ...event.candidate.toJSON(), owner: user?.id } as RTCIceCandidateInit & { owner?: string };
      const key = `${cand.owner}-${cand.candidate}`;
      if (seenIce.current.has(key)) return;
      seenIce.current.add(key);
      const { data } = await supabase.from('calls').select('ice_candidates').eq('id', callId).single();
      const existing = (data?.ice_candidates as unknown as (RTCIceCandidateInit & { owner?: string })[]) || [];
      await supabase.from('calls').update({ ice_candidates: [...existing, cand] as Json }).eq('id', callId);
    };

    pc.ontrack = (event) => {
      const track = event.track;
      const stream = event.streams[0] ?? new MediaStream([track]);
      setState((prev) => {
        // First video track = camera; second = screen
        if (track.kind === 'video') {
          if (!prev.remoteStream || remoteCamTrackId.current === null) {
            remoteCamTrackId.current = track.id;
            return { ...prev, remoteStream: stream };
          }
          if (track.id !== remoteCamTrackId.current) {
            return { ...prev, remoteScreenStream: stream };
          }
        }
        if (track.kind === 'audio') {
          if (!prev.remoteStream) return { ...prev, remoteStream: stream };
        }
        return prev;
      });
      track.onended = () => {
        setState((p) => (track.id === remoteCamTrackId.current ? p : { ...p, remoteScreenStream: null }));
      };
    };

    pc.onnegotiationneeded = async () => {
      if (!isCallerRef.current) return;
      // Skip first auto-negotiation; we drive the initial offer manually below.
      if (pc.signalingState !== 'stable') return;
      await renegotiate();
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') endCall();
    };

    pcRef.current = pc;
    return pc;
  }, [user, renegotiate, endCall]);

  const makeMediaStream = useCallback((type: 'voice' | 'video') => (
    navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: type === 'video' ? { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' } : false,
    })
  ), []);

  const startCall = useCallback(async (receiverId: string, type: 'voice' | 'video') => {
    if (!user) return;
    const stream = await makeMediaStream(type);

    const { data: session, error } = await supabase
      .from('calls')
      .insert({ caller_id: user.id, receiver_id: receiverId, call_type: type, status: 'ringing' })
      .select()
      .single();
    if (error || !session) { stream.getTracks().forEach((t) => t.stop()); throw error; }

    setState((prev) => ({ ...prev, isCalling: true, isCaller: true, callType: type, callId: session.id, localStream: stream }));

    const pc = createPeerConnection(session.id, true);
    stream.getTracks().forEach((t) => pc.addTrack(t, stream));

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await supabase.from('calls').update({ offer: { type: offer.type, sdp: offer.sdp } as Json }).eq('id', session.id);

    setTimeout(async () => {
      const { data } = await supabase.from('calls').select('status').eq('id', session.id).single();
      if (data?.status === 'ringing') {
        await supabase.from('calls').update({ status: 'missed', ended_at: new Date().toISOString() }).eq('id', session.id);
        endCall();
      }
    }, 30000);

    return session.id;
  }, [user, createPeerConnection, endCall, makeMediaStream]);

  const startGroupCall = useCallback(async (groupId: string, type: 'voice' | 'video') => {
    if (!user) return;
    const stream = await makeMediaStream(type);
    // Fetch members first, then profiles separately because this schema has no embedded FK relationship.
    const { data: members, error } = await supabase
      .from('group_members')
      .select('user_id')
      .eq('group_id', groupId);
    if (error) { stream.getTracks().forEach((t) => t.stop()); throw error; }
    const memberIds = (members || []).map((m) => m.user_id).filter((id) => id !== user.id);
    const { data: profiles, error: profileError } = memberIds.length
      ? await supabase.from('profiles').select('id').in('id', memberIds)
      : { data: [], error: null } as any;
    if (profileError) { stream.getTracks().forEach((t) => t.stop()); throw profileError; }
    const targets = (profiles || []).map((p: any) => p.id);
    if (targets.length === 0) { stream.getTracks().forEach((t) => t.stop()); throw new Error('No reachable group members to call'); }

    setState((prev) => ({ ...prev, isCalling: true, isCaller: true, callType: type, localStream: stream, isCameraOff: type !== 'video' }));

    let okCount = 0;
    for (const targetId of targets) {
      const { data: session, error: insErr } = await supabase
        .from('calls')
        .insert({ caller_id: user.id, receiver_id: targetId, call_type: type, status: 'ringing' })
        .select()
        .single();
      if (insErr || !session) {
        console.warn('skip group target (likely deleted user)', targetId, insErr?.message);
        continue;
      }
      const pc = createPeerConnection(session.id, true);
      groupPeersRef.current.set(session.id, pc);
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await supabase.from('calls').update({ offer: { type: offer.type, sdp: offer.sdp } as Json }).eq('id', session.id);
      callIdRef.current = session.id;
      setState((prev) => ({ ...prev, callId: session.id }));
      okCount++;
    }
    if (okCount === 0) {
      stream.getTracks().forEach((t) => t.stop());
      setState((prev) => ({ ...prev, isCalling: false, localStream: null }));
      throw new Error('No group members are reachable right now.');
    }
    return okCount;
  }, [user, makeMediaStream, createPeerConnection]);

  const acceptCall = useCallback(async (callId: string, callType: 'voice' | 'video') => {
    if (!user) return;
    const stream = await makeMediaStream(callType);
    const { data: session } = await supabase.from('calls').select('*').eq('id', callId).single();
    if (!session) throw new Error('Call not found');

    const pc = createPeerConnection(callId, false);
    stream.getTracks().forEach((t) => pc.addTrack(t, stream));

    await pc.setRemoteDescription(new RTCSessionDescription(session.offer as unknown as RTCSessionDescriptionInit));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await supabase.from('calls').update({
      status: 'accepted',
      answer: { type: answer.type, sdp: answer.sdp } as Json,
      started_at: new Date().toISOString(),
    }).eq('id', callId);

    for (const c of iceQueue.current) { try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch {} }
    iceQueue.current = [];

    setState((prev) => ({
      ...prev,
      isInCall: true,
      isCalling: false,
      isReceivingCall: false,
      callType,
      callId,
      localStream: stream,
      incomingCall: null,
      callDuration: 0,
      isCaller: false,
    }));
    startDuration();
    startStats(pc);
  }, [user, createPeerConnection, makeMediaStream]);

  const rejectCall = useCallback(async (callId: string) => {
    await supabase.from('calls').update({ status: 'rejected', ended_at: new Date().toISOString() }).eq('id', callId);
    setState((prev) => ({ ...prev, isReceivingCall: false, incomingCall: null, callerName: null }));
  }, []);

  const toggleMute = useCallback(() => {
    setState((prev) => {
      prev.localStream?.getAudioTracks().forEach((t) => (t.enabled = prev.isMuted));
      return { ...prev, isMuted: !prev.isMuted };
    });
  }, []);

  const toggleCamera = useCallback(async () => {
    const pc = pcRef.current;
    const current = state.localStream;
    const existingTrack = current?.getVideoTracks()[0];

    if (!state.isCameraOff && existingTrack) {
      existingTrack.stop();
      current?.removeTrack(existingTrack);
      setState((prev) => ({ ...prev, isCameraOff: true, localStream: current ? new MediaStream(current.getTracks()) : prev.localStream }));
      return;
    }

    const cam = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }, audio: false });
    const newTrack = cam.getVideoTracks()[0];
    if (!newTrack || !current) return;
    current.addTrack(newTrack);
    const sender = pc?.getSenders().find((s) => s.track?.kind === 'video' && s.track !== screenSenderRef.current?.track);
    if (sender) await sender.replaceTrack(newTrack);
    else if (pc) pc.addTrack(newTrack, current);
    setState((prev) => ({ ...prev, isCameraOff: false, localStream: new MediaStream(current.getTracks()) }));
    if (pc && isCallerRef.current) await renegotiate();
  }, [state.isCameraOff, state.localStream, renegotiate]);

  const startScreenShare = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc) return;
    const { getScreenShareDiagnostics, buildDisplayMediaConstraints, tryNativeScreenCapture } =
      await import('@/lib/screenShareDiagnostics');
    let screen = await tryNativeScreenCapture();
    if (!screen) {
      const diag = await getScreenShareDiagnostics();
      console.log('[Call] Screen-share diagnostics:', diag);
      if (!diag.screenShareSupported) {
        throw new Error(diag.unsupportedReason || 'Screen sharing is not supported on this device/browser.');
      }
      screen = await navigator.mediaDevices.getDisplayMedia(buildDisplayMediaConstraints({ audio: true }));
    }
    localScreenRef.current = screen;
    const videoTrack = screen.getVideoTracks()[0];
    const audioTrack = screen.getAudioTracks()[0];
    if (videoTrack) screenSenderRef.current = pc.addTrack(videoTrack, screen);
    if (audioTrack) screenAudioSenderRef.current = pc.addTrack(audioTrack, screen);
    for (const [groupCallId, groupPc] of groupPeersRef.current.entries()) {
      const senders: RTCRtpSender[] = [];
      if (videoTrack) senders.push(groupPc.addTrack(videoTrack, screen));
      if (audioTrack) senders.push(groupPc.addTrack(audioTrack, screen));
      groupScreenSendersRef.current.set(groupCallId, senders);
      if (groupPc.signalingState === 'stable') {
        const offer = await groupPc.createOffer();
        await groupPc.setLocalDescription(offer);
        await supabase.from('calls').update({ offer: { type: offer.type, sdp: offer.sdp } as Json, answer: null }).eq('id', groupCallId);
      }
    }
    videoTrack?.addEventListener('ended', () => { stopScreenShare(); });
    setState((p) => ({ ...p, localScreenStream: screen, isSharingScreen: true }));
    // If receiver started the share, we must ask caller to renegotiate; but onnegotiationneeded fires anyway on caller side. For receiver we need to flip role briefly: simplest = do a manual offer rollback via createOffer.
    if (!isCallerRef.current) {
      // Receiver-initiated screen share: send a renegotiation request through a temporary trick — create our own offer with iceRestart? Easier: take role of offerer for this round.
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await supabase.from('calls').update({ offer: { type: offer.type, sdp: offer.sdp } as Json, answer: null }).eq('id', callIdRef.current!);
      isCallerRef.current = true; // temporarily become offerer
    }
  }, [renegotiate]);

  const stopScreenShare = useCallback(async () => {
    const pc = pcRef.current;
    localScreenRef.current?.getTracks().forEach((t) => t.stop());
    localScreenRef.current = null;
    if (pc && screenSenderRef.current) { try { pc.removeTrack(screenSenderRef.current); } catch {} }
    if (pc && screenAudioSenderRef.current) { try { pc.removeTrack(screenAudioSenderRef.current); } catch {} }
    for (const [groupCallId, senders] of groupScreenSendersRef.current.entries()) {
      const groupPc = groupPeersRef.current.get(groupCallId);
      if (!groupPc) continue;
      senders.forEach((sender) => { try { groupPc.removeTrack(sender); } catch {} });
      if (groupPc.signalingState === 'stable') {
        const offer = await groupPc.createOffer();
        await groupPc.setLocalDescription(offer);
        await supabase.from('calls').update({ offer: { type: offer.type, sdp: offer.sdp } as Json, answer: null }).eq('id', groupCallId);
      }
    }
    groupScreenSendersRef.current.clear();
    screenSenderRef.current = null;
    screenAudioSenderRef.current = null;
    setState((p) => ({ ...p, localScreenStream: null, isSharingScreen: false }));
    if (pc && isCallerRef.current) await renegotiate();
  }, [renegotiate]);

  // Realtime signaling
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('call-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'calls' }, async (payload) => {
        const call = payload.new as CallSession;

        if (payload.eventType === 'INSERT' && call.receiver_id === user.id && call.status === 'ringing') {
          const { data: profile } = await supabase.from('profiles').select('display_name, email').eq('id', call.caller_id).single();
          setState((prev) => ({
            ...prev,
            isReceivingCall: true,
            incomingCall: call,
            callerName: profile?.display_name || profile?.email || 'Unknown',
          }));
          return;
        }

        if (payload.eventType !== 'UPDATE') return;
        const pc = call.id === callIdRef.current ? pcRef.current : groupPeersRef.current.get(call.id) || null;
        if (!pc) return;

        // Caller path: when our outgoing offer gets answered
        if (call.caller_id === user.id && call.status === 'accepted' && call.answer && pc.signalingState === 'have-local-offer') {
          await pc.setRemoteDescription(new RTCSessionDescription(call.answer as unknown as RTCSessionDescriptionInit));
          setState((prev) => prev.isInCall ? prev : { ...prev, isInCall: true, isCalling: false, callDuration: 0 });
          startDuration();
          startStats(pc);
        }

        // Renegotiation: a new offer arrives while we already have a connection
        if (call.offer && pc.currentRemoteDescription) {
          const newOffer = call.offer as unknown as RTCSessionDescriptionInit;
          if (newOffer.sdp !== pc.currentRemoteDescription.sdp) {
            // Only the non-offerer applies remote offers
            if (call.caller_id !== user.id && pc.signalingState === 'stable') {
              await pc.setRemoteDescription(new RTCSessionDescription(newOffer));
              const ans = await pc.createAnswer();
              await pc.setLocalDescription(ans);
              await supabase.from('calls').update({ answer: { type: ans.type, sdp: ans.sdp } as Json }).eq('id', call.id);
            } else if (call.caller_id === user.id && pc.signalingState === 'stable') {
              // Receiver-initiated renegotiation arrived as new offer; apply it.
              await pc.setRemoteDescription(new RTCSessionDescription(newOffer));
              const ans = await pc.createAnswer();
              await pc.setLocalDescription(ans);
              await supabase.from('calls').update({ answer: { type: ans.type, sdp: ans.sdp } as Json }).eq('id', call.id);
            }
          }
        }

        // Caller-side: when receiver-initiated renegotiation answer arrives
        if (call.caller_id !== user.id && call.answer && pc.signalingState === 'have-local-offer') {
          await pc.setRemoteDescription(new RTCSessionDescription(call.answer as unknown as RTCSessionDescriptionInit));
        }

        if (call.caller_id === user.id && (call.status === 'rejected' || call.status === 'missed')) {
          endCall();
          return;
        }

        if (call.ice_candidates) {
          const candidates = call.ice_candidates as unknown as (RTCIceCandidateInit & { owner?: string })[];
          for (const c of candidates) {
            if (c.owner === user.id) continue;
            const key = `peer-${c.candidate}`;
            if (seenIce.current.has(key)) continue;
            seenIce.current.add(key);
            try {
              if (pc.remoteDescription) await pc.addIceCandidate(new RTCIceCandidate(c));
              else iceQueue.current.push(c);
            } catch {}
          }
        }

        if (call.status === 'ended') endCall();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, endCall]);

  const formatDuration = (s: number) => {
    const m = Math.floor(s / 60);
    return `${m.toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;
  };

  return {
    ...state,
    startCall,
    startGroupCall,
    acceptCall,
    rejectCall,
    endCall,
    toggleMute,
    toggleCamera,
    startScreenShare,
    stopScreenShare,
    formatDuration,
  };
}
