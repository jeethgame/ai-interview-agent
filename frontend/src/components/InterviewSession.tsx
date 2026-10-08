import React, { useState, useEffect, useRef } from 'react';
import CockpitChatStream from './CockpitChatStream';
import CockpitAudioWave from './CockpitAudioWave';
import TranscriptDrawer from './TranscriptDrawer';
import InterviewInstructionsModal from './InterviewInstructionsModal';
import { SessionWarningDialog } from './SessionWarningDialog';
import { useVoiceFirstInterview } from '../hooks/useVoiceFirstInterview';
import { Message, CoachFeedbackState } from '@/hooks/useInterviewSession';
import { Button } from '@/components/ui/button';
import { MessageSquare, Clock, Keyboard, Send, AlertTriangle, CheckCircle } from 'lucide-react';

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

  // Session timer
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

  // "Understood" button → countdown → voice starts
  const handleInstructionsDismiss = () => {
    startVoiceSession(); // start NOW on gesture — pre-warm during countdown
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
    <div className="relative w-full h-screen overflow-hidden bg-[#0A0A0F]">

      {/* ── Instructions Modal ── */}
      {phase === 'instructions' && (
        <InterviewInstructionsModal isOpen onClose={handleInstructionsDismiss} />
      )}

      {/* ── Countdown Overlay ── */}
      {phase === 'countdown' && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm">
          <p className="text-white text-lg font-semibold mb-4 tracking-wide">Starting interview in</p>
          <div className="w-28 h-28 rounded-full border-4 border-[#DC2626] flex items-center justify-center shadow-[0_0_40px_rgba(220,38,38,0.5)]">
            <span className="text-6xl font-black text-white">{countdown}</span>
          </div>
          <p className="text-white/60 text-sm mt-5">Preparing voice session…</p>
        </div>
      )}

      {/* ── Top Bar ── */}
      {phase === 'live' && (
        <div className="fixed top-0 left-0 right-0 flex justify-between items-center px-5 sm:px-8 py-3 z-20 bg-black/50 backdrop-blur-lg border-b border-white/8">
          <div className={`flex items-center gap-2 px-4 py-1.5 rounded-full border text-[13px] font-bold font-mono transition-colors ${
            isExpired ? 'border-[#DC2626] text-[#DC2626] bg-red-50' :
            isLowTime ? 'border-[#DC2626] text-[#DC2626] bg-red-50 animate-pulse' :
            'border-amber-500/40 text-amber-400 bg-amber-500/10'
          }`}>
            <Clock size={14} />
            <span>{mm}:{ss}</span>
          </div>

          {/* Turn indicator */}
          <div className="flex items-center gap-3">
            {turnState === 'ai' && (
              <span className="text-xs font-bold text-[#DC2626] uppercase tracking-wider flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#DC2626] animate-pulse" />
                AI Speaking
              </span>
            )}
            {turnState === 'user' && (
              <span className="text-xs font-bold text-[#EAB308] uppercase tracking-wider flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#EAB308] animate-pulse" />
                Your Turn
              </span>
            )}
            {turnState === 'idle' && (
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-gray-400 animate-pulse" />
                Connecting…
              </span>
            )}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowEndConfirm(true)}
            className="border-[#DC2626] text-[#DC2626] hover:bg-[#DC2626] hover:text-white font-semibold text-xs rounded-lg px-4"
          >
            End Interview
          </Button>
        </div>
      )}

      {/* ── Chat Stream ── */}
      {phase === 'live' && (
        <div className="fixed inset-0 flex flex-col justify-end items-center z-10" style={{ padding: '64px 0 150px 0' }}>
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

      {/* ── WebGL Audio Wave ── */}
      {phase === 'live' && (
        <CockpitAudioWave
          turnState={turnState}
          isListening={isListening}
          isProcessing={isProcessing}
          voiceActivity={voiceActivityLevel}
        />
      )}

      {/* ── Dev Text Input Bar ── */}
      {phase === 'live' && devInputOpen && (
        <div className="fixed bottom-[76px] left-1/2 -translate-x-1/2 z-[25] w-full max-w-xl px-4">
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-[#13131A] border border-white/10 shadow-[0_4px_25px_rgba(0,0,0,0.5)]">
            <input
              type="text"
              value={devText}
              onChange={(e) => setDevText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleDevSend(); }}
              placeholder="Type your response here..."
              autoFocus
              disabled={isLoading}
              className="flex-1 bg-transparent text-sm text-white placeholder-white/30 outline-none"
            />
            <button
              onClick={handleDevSend}
              disabled={!devText.trim() || isLoading}
              className="w-9 h-9 rounded-xl bg-[#DC2626] hover:bg-[#B91C1C] disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-colors shrink-0"
            >
              <Send size={15} className="text-white" />
            </button>
          </div>
        </div>
      )}

      {/* ── Primary Turn Control — only when user's turn ── */}
      {phase === 'live' && turnState === 'user' && (
        <div className="fixed bottom-[68px] left-1/2 -translate-x-1/2 z-20">
          <button
            onClick={finishAnswer}
            title="Finish your answer (Tab / Space)"
            className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl text-sm font-semibold shadow-lg transition-all duration-200 ${
              isUserSpeaking
                ? 'bg-[#DC2626] text-white ring-2 ring-[#DC2626]/40 animate-pulse shadow-[0_4px_20px_rgba(220,38,38,0.35)]'
                : 'bg-[#DC2626] text-white hover:bg-red-700 shadow-[0_4px_16px_rgba(220,38,38,0.25)]'
            }`}
          >
            <CheckCircle size={16} />
            Finish Answer
            <span className="opacity-50 text-[11px] font-normal ml-0.5">Tab / Space</span>
          </button>
        </div>
      )}

      {/* ── Secondary Control Dock ── */}
      {phase === 'live' && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1 p-1.5 rounded-2xl bg-[#13131A] border border-white/10 shadow-[0_4px_30px_rgba(0,0,0,0.5)]">
          <button
            onClick={() => setTranscriptOpen(!transcriptOpen)}
            title="Toggle transcript"
            className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-200 ${
              transcriptOpen
                ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                : 'bg-white/5 text-white/40 hover:bg-white/10 border border-white/8'
            }`}
          >
            <MessageSquare size={18} />
          </button>

          <button
            onClick={() => setDevInputOpen(!devInputOpen)}
            title="Toggle text input"
            className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-200 ${
              devInputOpen
                ? 'bg-red-500/15 text-red-400 border border-red-500/30'
                : 'bg-white/5 text-white/40 hover:bg-white/10 border border-white/8'
            }`}
          >
            <Keyboard size={18} />
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
          <div className="bg-[#13131A] border border-white/10 rounded-2xl p-6 max-w-sm w-full shadow-[0_8px_40px_rgba(0,0,0,0.6)] space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-500/15 border border-red-500/25 flex items-center justify-center">
                <AlertTriangle size={18} className="text-red-400" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">End Interview?</h3>
                <p className="text-xs text-white/40">Your session will be evaluated.</p>
              </div>
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" size="sm" onClick={() => setShowEndConfirm(false)} className="text-xs">
                Cancel
              </Button>
              <Button size="sm" onClick={() => { setShowEndConfirm(false); onEndInterview(); }} className="bg-[#DC2626] hover:bg-[#B91C1C] text-white text-xs">
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
        onEndNow={() => { onSessionTimeout(); }}
      />
    </div>
  );
};

export default InterviewSession;
