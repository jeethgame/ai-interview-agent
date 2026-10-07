import React, { useState, useEffect, useRef, useMemo } from 'react';
import CockpitChatStream from './CockpitChatStream';
import TranscriptDrawer from './TranscriptDrawer';
import InterviewInstructionsModal from './InterviewInstructionsModal';
import { SessionWarningDialog } from './SessionWarningDialog';
import { useVoiceFirstInterview } from '../hooks/useVoiceFirstInterview';
import { Message, CoachFeedbackState } from '@/hooks/useInterviewSession';
import { Button } from '@/components/ui/button';
import { Clock, Keyboard, Send, AlertTriangle, CheckCircle, MessageSquare, Volume2, Sparkles } from 'lucide-react';
import { AICSSOrb, OrbState } from './aicss/AICSSOrb';
import { AgentVisualizerContainer, VisualizerMode } from './livekit/AgentVisualizerContainer';

interface InterviewSessionProps {
  interviewDurationMinutes?: number;
  sessionId?: string;
  messages: Message[];
  isLoading: boolean;
  onSendMessage: (message: string) => void;
  onEndInterview: () => void;
  onVoiceSelect: (voiceId: string | null) => void;
  coachFeedbackStates: CoachFeedbackState;
  showSessionWarning: boolean;
  sessionTimeRemaining: number | null;
  onExtendSession: () => void;
  onSessionTimeout: () => void;
}

const InterviewSession: React.FC<InterviewSessionProps> = ({
  interviewDurationMinutes = 10,
  sessionId,
  messages,
  isLoading,
  onSendMessage,
  onEndInterview,
  onVoiceSelect,
  coachFeedbackStates,
  showSessionWarning,
  sessionTimeRemaining,
  onExtendSession,
  onSessionTimeout,
}) => {
  const [phase, setPhase] = useState<'instructions' | 'countdown' | 'live'>('instructions');
  const [countdown, setCountdown] = useState(3);
  const [selectedVoice, setSelectedVoice] = useState<string | null>(null);
  const [sessionStartTime, setSessionStartTime] = useState<number | null>(null);
  const [currentTime, setCurrentTime] = useState(Date.now());
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [devInputOpen, setDevInputOpen] = useState(false);
  const [devText, setDevText] = useState('');
  const [showCenterOrb, setShowCenterOrb] = useState(true);
  const autoEndedRef = useRef(false);

  const {
    voiceActivityLevel,
    accumulatedTranscript,
    aiTextRef,
    isUserSpeaking,
    isListening,
    isProcessing,
    turnState,
    audioPlaying,
    startVoiceSession,
    finishAnswer,
  } = useVoiceFirstInterview(
    { messages, isLoading, state: 'interviewing', selectedVoice, sessionId },
    onSendMessage,
    onEndInterview,
  );

  // Clock tick
  useEffect(() => {
    const id = setInterval(() => setCurrentTime(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Tab or Space → finish answer
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Tab' && e.code !== 'Space') return;
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (phase === 'live' && isListening && turnState !== 'ai') {
        e.preventDefault();
        finishAnswer();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [finishAnswer, isListening, turnState, phase]);

  // Session timer calculation
  const totalSeconds = interviewDurationMinutes * 60;
  const elapsed = sessionStartTime ? Math.floor((currentTime - sessionStartTime) / 1000) : 0;
  const remaining = Math.max(0, totalSeconds - elapsed);
  const mm = String(Math.floor(remaining / 60)).padStart(2, '0');
  const ss = String(remaining % 60).padStart(2, '0');
  const isLowTime = remaining < 120 && remaining > 0 && sessionStartTime !== null;
  const isExpired = remaining === 0 && sessionStartTime !== null;

  useEffect(() => {
    if (isExpired && !autoEndedRef.current) {
      autoEndedRef.current = true;
      onEndInterview();
    }
  }, [isExpired, onEndInterview]);

  // Current agent orb & visualizer state mapping
  const currentAgentState: OrbState = useMemo(() => {
    if (turnState === 'ai') {
      return audioPlaying ? 'speaking' : isProcessing ? 'thinking' : 'thinking';
    }
    if (turnState === 'user') {
      return 'listening';
    }
    return 'idle';
  }, [turnState, audioPlaying, isProcessing]);

  // "Understood" button → countdown → voice starts
  const handleInstructionsDismiss = () => {
    startVoiceSession();
    setPhase('countdown');
    onVoiceSelect('enabled');
    let t = 3;
    setCountdown(t);
    const tick = setInterval(() => {
      t--;
      if (t <= 0) {
        clearInterval(tick);
        setPhase('live');
        setSessionStartTime(Date.now());
      } else {
        setCountdown(t);
      }
    }, 1000);
  };

  const handleDevSend = () => {
    const trimmed = devText.trim();
    if (trimmed && !isLoading) {
      onSendMessage(trimmed);
      setDevText('');
    }
  };

  return (
    <div className="relative w-full h-screen overflow-hidden bg-gradient-to-b from-[#FAFBFD] via-[#F4F6FB] to-[#FEF3C7]/20 select-none">

      {/* ── Instructions Modal ── */}
      {phase === 'instructions' && (
        <InterviewInstructionsModal isOpen onClose={handleInstructionsDismiss} />
      )}

      {/* ── Countdown Overlay with AICSS Orb ── */}
      {phase === 'countdown' && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/75 backdrop-blur-md">
          <div className="relative mb-6">
            <AICSSOrb state="connecting" size="hero" />
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <span className="text-5xl font-black text-white drop-shadow-[0_0_20px_rgba(255,255,255,0.8)]">
                {countdown}
              </span>
            </div>
          </div>
          <p className="text-white text-lg font-semibold tracking-wide">
            Calibrating Voice Agent…
          </p>
          <p className="text-white/60 text-xs mt-2">
            Speak naturally when the interview begins.
          </p>
        </div>
      )}

      {/* ── Top Bar ── */}
      {phase === 'live' && (
        <header className="fixed top-0 left-0 right-0 flex justify-between items-center px-6 py-3.5 z-30 bg-white/70 backdrop-blur-xl border-b border-gray-200/60 shadow-xs">
          {/* Timer chip */}
          <div
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full border text-[13px] font-bold font-mono transition-all shadow-xs ${
              isExpired
                ? 'border-[#DC2626] text-[#DC2626] bg-red-50'
                : isLowTime
                ? 'border-[#DC2626] text-[#DC2626] bg-red-50 animate-pulse'
                : 'border-[#EAB308]/60 text-[#92400E] bg-[#FEF3C7]/70'
            }`}
          >
            <Clock size={14} />
            <span>{mm}:{ss}</span>
          </div>

          {/* Center AICSS Agent Status Indicator Chip */}
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-white/80 border border-gray-200/80 shadow-xs backdrop-blur-sm">
            <AICSSOrb
              state={currentAgentState}
              voiceActivity={voiceActivityLevel}
              size="xs"
            />
            <span className="text-xs font-semibold tracking-wide capitalize">
              {currentAgentState === 'speaking' && (
                <span className="text-[#DC2626] flex items-center gap-1">
                  AI Speaking
                </span>
              )}
              {currentAgentState === 'thinking' && (
                <span className="text-purple-600 flex items-center gap-1">
                  Reasoning…
                </span>
              )}
              {currentAgentState === 'listening' && (
                <span className="text-amber-600 flex items-center gap-1">
                  Listening to you
                </span>
              )}
              {currentAgentState === 'idle' && (
                <span className="text-gray-500">Standby</span>
              )}
            </span>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowCenterOrb(!showCenterOrb)}
              className="text-xs hidden sm:flex items-center gap-1.5 border-gray-200 text-gray-700 hover:bg-gray-100/80 rounded-xl px-3"
              title="Toggle Centerpiece Agent Orb"
            >
              <Sparkles size={13} className="text-[#EAB308]" />
              {showCenterOrb ? 'Hide Avatar' : 'Show Avatar'}
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowEndConfirm(true)}
              className="border-red-200 text-[#DC2626] hover:bg-[#DC2626] hover:text-white font-semibold text-xs rounded-xl px-4 transition-colors"
            >
              End Interview
            </Button>
          </div>
        </header>
      )}

      {/* ── Background / Center AI Visualizer Presence ── */}
      {phase === 'live' && showCenterOrb && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-0 pointer-events-none opacity-80 flex flex-col items-center">
          <AICSSOrb
            state={currentAgentState}
            voiceActivity={voiceActivityLevel}
            size="lg"
            showLabel
          />
        </div>
      )}

      {/* ── Cockpit Chat Stream ── */}
      {phase === 'live' && (
        <div
          className="fixed inset-0 flex flex-col justify-end items-center z-10"
          style={{ padding: '72px 0 200px 0' }}
        >
          <CockpitChatStream
            messages={messages}
            turnState={turnState}
            isListening={isListening}
            isProcessing={isProcessing}
            accumulatedTranscript={accumulatedTranscript}
            aiTextRef={aiTextRef}
            isUserSpeaking={isUserSpeaking}
            audioPlaying={audioPlaying}
          />
        </div>
      )}

      {/* ── LiveKit Audio Visualizer Suite (Grid / Aura / Wave / Radial / Spectrum) ── */}
      {phase === 'live' && (
        <div className="fixed bottom-0 left-0 right-0 h-48 z-15 pointer-events-none">
          <div className="w-full h-full pointer-events-auto">
            <AgentVisualizerContainer
              state={currentAgentState}
              voiceActivity={voiceActivityLevel}
              initialMode="grid"
              showSelector={true}
              color="#DC2626"
              accentColor="#EAB308"
            />
          </div>
        </div>
      )}

      {/* ── Dev Text Input Bar ── */}
      {phase === 'live' && devInputOpen && (
        <div className="fixed bottom-[92px] left-1/2 -translate-x-1/2 z-30 w-full max-w-xl px-4 animate-fade-in">
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-white/95 backdrop-blur-xl border border-gray-200 shadow-xl">
            <input
              type="text"
              value={devText}
              onChange={(e) => setDevText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleDevSend();
              }}
              placeholder="Type your response here..."
              autoFocus
              disabled={isLoading}
              className="flex-1 bg-transparent text-sm text-[#111827] placeholder-[#9CA3AF] outline-none"
            />
            <button
              onClick={handleDevSend}
              disabled={!devText.trim() || isLoading}
              className="w-9 h-9 rounded-xl bg-[#DC2626] hover:bg-[#B91C1C] disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-colors shrink-0 shadow-sm"
            >
              <Send size={15} className="text-white" />
            </button>
          </div>
        </div>
      )}

      {/* ── Primary Turn Control — Finish Answer Button ── */}
      {phase === 'live' && turnState === 'user' && (
        <div className="fixed bottom-[88px] left-1/2 -translate-x-1/2 z-25 animate-fade-in">
          <button
            onClick={finishAnswer}
            title="Finish your answer (Tab / Space)"
            className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl text-sm font-semibold shadow-lg transition-all duration-200 ${
              isUserSpeaking
                ? 'bg-[#DC2626] text-white ring-4 ring-[#DC2626]/30 animate-pulse shadow-[0_4px_25px_rgba(220,38,38,0.4)]'
                : 'bg-[#DC2626] text-white hover:bg-red-700 shadow-[0_4px_16px_rgba(220,38,38,0.25)] hover:scale-105 active:scale-95'
            }`}
          >
            <CheckCircle size={16} />
            Finish Answer
            <span className="opacity-60 text-[11px] font-mono font-normal ml-0.5">
              Tab / Space
            </span>
          </button>
        </div>
      )}

      {/* ── Secondary Control Dock ── */}
      {phase === 'live' && (
        <div className="fixed bottom-4 left-6 z-25 flex items-center gap-2 p-1.5 rounded-2xl bg-white/85 backdrop-blur-xl border border-gray-200/80 shadow-md">
          <button
            onClick={() => setTranscriptOpen(!transcriptOpen)}
            title="Toggle Transcript Drawer"
            className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 ${
              transcriptOpen
                ? 'bg-[#FEF3C7] text-[#92400E] border border-[#EAB308]'
                : 'bg-gray-50 text-[#6B7280] hover:bg-gray-100 border border-gray-200'
            }`}
          >
            <MessageSquare size={17} />
          </button>

          <button
            onClick={() => setDevInputOpen(!devInputOpen)}
            title="Toggle Keyboard Input"
            className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 ${
              devInputOpen
                ? 'bg-[#DC2626]/10 text-[#DC2626] border border-[#DC2626]/30'
                : 'bg-gray-50 text-[#6B7280] hover:bg-gray-100 border border-gray-200'
            }`}
          >
            <Keyboard size={17} />
          </button>
        </div>
      )}

      {/* ── Transcript Drawer ── */}
      <TranscriptDrawer
        isOpen={transcriptOpen}
        messages={messages}
        onClose={() => setTranscriptOpen(false)}
        onSendTextFromTranscript={onSendMessage}
        coachFeedbackStates={coachFeedbackStates}
      />

      {/* ── End Confirm Modal ── */}
      {showEndConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-white border border-gray-200 rounded-2xl p-6 max-w-sm w-full shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-50 border border-red-200 flex items-center justify-center shrink-0">
                <AlertTriangle size={18} className="text-[#DC2626]" />
              </div>
              <div>
                <h3 className="text-base font-bold text-[#111827]">End Interview?</h3>
                <p className="text-xs text-[#6B7280]">
                  Your completed responses will be evaluated to generate your final report.
                </p>
              </div>
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowEndConfirm(false)}
                className="text-xs rounded-xl"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  setShowEndConfirm(false);
                  onEndInterview();
                }}
                className="bg-[#DC2626] hover:bg-[#B91C1C] text-white text-xs rounded-xl shadow-sm"
              >
                End Session
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Session Warning ── */}
      <SessionWarningDialog
        open={showSessionWarning}
        timeRemaining={sessionTimeRemaining}
        onExtend={onExtendSession}
        onEndNow={() => {
          onSessionTimeout();
        }}
      />
    </div>
  );
};

export default InterviewSession;
