/**
 * useVoiceFirstInterview — WebSocket edition.
 *
 * Transport: WebSocket → backend /api/speech-to-text/stream
 * STT: Deepgram (server-side, live streaming)
 * TTS: Deepgram (server-side, 16kHz PCM chunks played via StreamingAudioPlayer)
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { Message } from './useInterviewSession';
import { useToast } from './use-toast';
import { StreamingSpeechRecognition } from '../services/api';
import { StreamingAudioPlayer } from '../utils/streamingAudioPlayer';

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

  const [turnState, setTurnState]                   = useState<'user' | 'ai' | 'idle'>('idle');
  const [audioPlaying, setAudioPlaying]             = useState(false);
  const [microphoneActive, setMicrophoneActive]     = useState(false);
  const [voiceActivityLevel, setVoiceActivityLevel] = useState(0);
  const [accumulatedTranscript, setAccumulatedTranscript] = useState('');
  const [isUserSpeaking, setIsUserSpeaking]         = useState(false);

  const aiTextRef      = useRef<HTMLSpanElement | null>(null);
  const speechRef      = useRef<StreamingSpeechRecognition | null>(null);
  const playerRef      = useRef<StreamingAudioPlayer | null>(null);
  const aiTypingRef    = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopVoiceSession = useCallback(() => {
    if (aiTypingRef.current) { clearInterval(aiTypingRef.current); aiTypingRef.current = null; }
    speechRef.current?.stop();
    speechRef.current = null;
    playerRef.current?.close();
    playerRef.current = null;
    setMicrophoneActive(false);
    setAudioPlaying(false);
    setTurnState('idle');
    setAccumulatedTranscript('');
    setIsUserSpeaking(false);
    setVoiceActivityLevel(0);
  }, []);

  const startVoiceSession = useCallback(async () => {
    if (speechRef.current) return;

    const player = new StreamingAudioPlayer((playing) => {
      setAudioPlaying(playing);
      if (playing) {
        setTurnState('ai');
        speechRef.current?.setMuted(true);  // mute mic while AI speaks
      } else {
        setTurnState('user');               // hand turn to user after AI finishes
        speechRef.current?.setMuted(false); // unmute mic
      }
    });
    playerRef.current = player;

    const speech = new StreamingSpeechRecognition({
      sessionId: sessionData.sessionId,
      onConnected: () => {
        setMicrophoneActive(true);
        setTurnState('idle');       // stay idle until AI finishes first question
        speechRef.current?.setMuted(true); // mute until it's user's turn
        player.unlock().catch(() => {});
      },
      onDisconnected: () => {
        setMicrophoneActive(false);
        setTurnState('idle');
      },
      onTranscript: (text, isFinal, role) => {
        if (role === 'user' && text.trim()) {
          setAccumulatedTranscript(prev => isFinal ? text : (text || prev));
        }
        if (role === 'assistant' && text.trim()) {
          // Animate words into aiTextRef as audio plays
          if (aiTypingRef.current) clearInterval(aiTypingRef.current);
          if (aiTextRef.current) aiTextRef.current.textContent = '';
          const words = text.split(' ');
          let i = 0;
          aiTypingRef.current = setInterval(() => {
            if (!aiTextRef.current) return;
            if (i < words.length) {
              aiTextRef.current.textContent += (i > 0 ? ' ' : '') + words[i];
              i++;
            } else {
              clearInterval(aiTypingRef.current!);
              aiTypingRef.current = null;
            }
          }, 110); // ~110ms per word ≈ natural speech pace
        }
      },
      onAudioChunk: (b64) => {
        player.playChunk(b64);
      },
      onTurnEnded: () => {
        // Do NOT switch turn here — audio is queued but not yet played.
        // StreamingAudioPlayer.onPlaybackStateChange(false) handles the turn switch
        // after audio actually finishes playing.
      },
      onUserSpeaking: (speaking) => {
        setIsUserSpeaking(speaking);
        setVoiceActivityLevel(speaking ? 0.7 : 0);
      },
      onInterviewEnding: () => {
        onEndInterview?.();
      },
      onError: (err) => {
        console.error('[Voice] error:', err);
        toast({ title: 'Voice Error', description: err, variant: 'destructive' });
      },
    });

    speechRef.current = speech;

    try {
      await speech.start();
    } catch (e: any) {
      speechRef.current = null;
      playerRef.current = null;
      toast({
        title: 'Voice Error',
        description: e?.message ?? 'Could not start voice session.',
        variant: 'destructive',
      });
    }
  }, [sessionData.sessionId, onSendMessage, onEndInterview, toast]);

  const finishAnswer = useCallback(() => {
    speechRef.current?.sendEndOfTurn();
    // Flush accumulated transcript to chat as the user message
    setAccumulatedTranscript(prev => {
      if (prev.trim() && onSendMessage) onSendMessage(prev.trim());
      return '';
    });
    setIsUserSpeaking(false);
    setVoiceActivityLevel(0);
  }, [onSendMessage]);

  useEffect(() => {
    return () => stopVoiceSession();
  }, [stopVoiceSession]);

  const isListening  = microphoneActive && turnState === 'user';
  const isProcessing = false;
  const isDisabled   = sessionData.state !== 'interviewing';

  const unlockAudio = useCallback(() => {
    playerRef.current?.unlock().catch(() => {});
  }, []);

  const toggleMicrophone = useCallback(async () => {
    if (!speechRef.current) await startVoiceSession();
  }, [startVoiceSession]);

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
      voiceActivity: { isDetected: isUserSpeaking, volume: voiceActivityLevel, timestamp: 0 },
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

    unlockAudio,
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
