/**
 * useVoiceFirstInterview — Voxie WebRTC (WHIP) edition.
 *
 * Transport: WebRTC WHIP → Voxie daemon (:8080)
 * STT/TTS:   Deepgram (handled by Voxie Go server — no client-side audio decoding)
 *
 * What changed vs the previous WebSocket/PCM edition:
 *  - startVoiceSession: RTCPeerConnection WHIP handshake instead of WebSocket
 *  - stopVoiceSession:  pc.close() instead of ws.close() + StreamingAudioPlayer.stop()
 *  - Audio playback:    browser WebRTC engine (no jitter buffer, no autoplay hacks)
 *  - VAD waveform:      unchanged — still driven by getUserMedia stream via AnalyserNode
 *
 * @deprecated StreamingAudioPlayer — replaced by native WebRTC browser playback via Voxie
 * @deprecated StreamingSpeechRecognition — replaced by Voxie Deepgram STT
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { Message } from './useInterviewSession';
import { useToast } from './use-toast';

const VOXIE_WHIP_URL = 'http://localhost:8080/whip';

export type VoiceState = {
  microphoneState: 'idle' | 'listening' | 'processing' | 'disabled';
  audioState: 'idle' | 'playing' | 'buffering';
  turnState: 'user' | 'ai' | 'idle';
  audioPlaying: boolean;
  voiceActivity: { isDetected: boolean; volume: number; timestamp: number };
};

export interface SessionData {
  messages: Message[];
  isLoading: boolean;
  state: string;
  selectedVoice: string | null;
  sessionId?: string;
  results?: any;
  disableAutoTTS?: boolean;
}

export function useVoiceFirstInterview(
  sessionData: SessionData,
  onSendMessage?: (message: string) => void,
  onEndInterview?: () => void
) {
  const { toast } = useToast();

  const [turnState, setTurnState] = useState<'user' | 'ai' | 'idle'>('idle');
  const turnStateRef = useRef<'user' | 'ai' | 'idle'>('idle');
  const setTurn = (s: 'user' | 'ai' | 'idle') => {
    turnStateRef.current = s;
    setTurnState(s);
  };

  const [audioPlaying, setAudioPlaying]           = useState(false);
  const [microphoneActive, setMicrophoneActive]   = useState(false);
  const [voiceActivityLevel, setVoiceActivityLevel] = useState(0);
  const [accumulatedTranscript, setAccumulatedTranscript] = useState('');
  const [isUserSpeaking, setIsUserSpeaking]       = useState(false);

  const aiTextRef      = useRef<HTMLSpanElement | null>(null);
  const peerRef        = useRef<RTCPeerConnection | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const micStreamRef   = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef    = useRef<AnalyserNode | null>(null);
  const vadCleanupRef  = useRef<(() => void) | null>(null);

  // ── VAD waveform (driven by local mic stream — same as before) ────────────

  const setupVoiceActivityDetection = useCallback(async () => {
    try {
      if (!micStreamRef.current) return;
      if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }

      const source = audioContextRef.current.createMediaStreamSource(micStreamRef.current);
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      source.connect(analyserRef.current);

      const bufferLength = analyserRef.current.frequencyBinCount;
      const dataArray    = new Uint8Array(bufferLength);
      let animId: number;

      const update = () => {
        if (analyserRef.current) {
          analyserRef.current.getByteFrequencyData(dataArray);
          const avg = dataArray.reduce((s, v) => s + v, 0) / bufferLength;
          setVoiceActivityLevel(Math.min(1, avg / 128));
          setIsUserSpeaking(avg > 20);
        }
        animId = requestAnimationFrame(update);
      };
      update();

      return () => cancelAnimationFrame(animId);
    } catch (e) {
      console.error('VAD setup error:', e);
    }
  }, []);

  // ── Voice session (Voxie WHIP WebRTC) ─────────────────────────────────────

  const startVoiceSession = useCallback(async () => {
    if (peerRef.current) return; // already connected

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;

      const pc = new RTCPeerConnection();
      peerRef.current = pc;

      // Send mic audio to Voxie
      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      // Receive Deepgram TTS audio from Voxie — browser handles playout + echo cancel
      pc.ontrack = (event) => {
        if (!remoteAudioRef.current) {
          remoteAudioRef.current = new Audio();
        }
        remoteAudioRef.current.srcObject = event.streams[0];
        remoteAudioRef.current.play().catch(console.error);
        setAudioPlaying(true);
        setTurn('ai');
      };

      pc.onconnectionstatechange = () => {
        const state = pc.connectionState;
        if (state === 'connected') {
          setMicrophoneActive(true);
          setTurn('idle');
          setupVoiceActivityDetection().then(cleanup => {
            vadCleanupRef.current = cleanup || null;
          });
          console.log('🎙️ Voxie WHIP connected');
        }
        if (state === 'disconnected' || state === 'failed' || state === 'closed') {
          setMicrophoneActive(false);
          setTurn('idle');
          setAudioPlaying(false);
          peerRef.current = null;
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      // WHIP handshake — X-Resource-ID carries our session_id so Voxie maps call_id → session
      const res = await fetch(VOXIE_WHIP_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/sdp',
          'X-Resource-ID': sessionData.sessionId ?? '',
        },
        body: offer.sdp,
      });

      if (!res.ok) throw new Error(`WHIP handshake failed: ${res.status}`);
      const answerSdp = await res.text();
      await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });

    } catch (e: any) {
      console.error('Failed to start Voxie session:', e);
      peerRef.current?.close();
      peerRef.current = null;
      toast({
        title: 'Voice Error',
        description: e?.message ?? 'Could not connect to Voxie. Is the daemon running?',
        variant: 'destructive',
      });
    }
  }, [setupVoiceActivityDetection, toast, sessionData.sessionId]);

  const stopVoiceSession = useCallback(() => {
    vadCleanupRef.current?.();
    vadCleanupRef.current = null;

    peerRef.current?.close();
    peerRef.current = null;

    if (remoteAudioRef.current) {
      remoteAudioRef.current.pause();
      remoteAudioRef.current.srcObject = null;
      remoteAudioRef.current = null;
    }

    micStreamRef.current?.getTracks().forEach(t => t.stop());
    micStreamRef.current = null;

    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    analyserRef.current = null;

    setMicrophoneActive(false);
    setTurn('idle');
    setAudioPlaying(false);
    setAccumulatedTranscript('');
    setIsUserSpeaking(false);
    setVoiceActivityLevel(0);
  }, []);

  useEffect(() => {
    return () => stopVoiceSession();
  }, [stopVoiceSession]);

  // ── Derived state ──────────────────────────────────────────────────────────

  const isListening  = microphoneActive && turnState !== 'ai';
  const isProcessing = false;
  const isDisabled   = sessionData.state !== 'interviewing';

  const toggleMicrophone = useCallback(async () => {
    if (!peerRef.current) await startVoiceSession();
  }, [startVoiceSession]);

  // Voxie handles turn detection — finishAnswer is a no-op in WebRTC mode
  const finishAnswer = useCallback(() => {
    console.log('finishAnswer: turn management delegated to Voxie VAD');
  }, []);

  return {
    messages:      sessionData.messages,
    isLoading:     sessionData.isLoading,
    state:         sessionData.state,
    results:       sessionData.results,
    selectedVoice: sessionData.selectedVoice,

    voiceState: {
      microphoneState: 'listening' as const,
      audioState:      'idle' as const,
      turnState,
      audioPlaying,
      voiceActivity: { isDetected: false, volume: 0, timestamp: 0 },
    },
    microphoneActive,
    audioPlaying,
    voiceActivityLevel,
    accumulatedTranscript,
    aiTextRef,
    streamingAiText: '',
    isUserSpeaking,

    isListening,
    isProcessing,
    isDisabled,
    turnState,

    toggleMicrophone,
    startVoiceSession,
    stopVoiceSession,
    finishAnswer,
    toggleTranscript:     () => {},
    toggleCoachFeedback:  () => {},
    closeCoachFeedback:   () => {},
    handleTTSStart:       () => {},
    handleTTSEnd:         () => {},
    playTextToSpeech:     async (_: string) => {},
    lastExchange: { userMessage: '', aiMessage: '' },
  };
}

export type { Message, CoachFeedbackState } from './useInterviewSession';
