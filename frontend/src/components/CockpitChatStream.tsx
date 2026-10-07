import React, { useEffect, useRef } from 'react';
import { Message } from '@/hooks/useInterviewSession';
import { AICSSOrb } from './aicss/AICSSOrb';

interface CockpitChatStreamProps {
  messages: Message[];
  turnState: 'user' | 'ai' | 'idle';
  isListening: boolean;
  isProcessing: boolean;
  accumulatedTranscript?: string;
  streamingAiText?: string;
  aiTextRef?: React.RefObject<HTMLSpanElement | null>;
  isUserSpeaking?: boolean;
  audioPlaying?: boolean;
}

const CockpitChatStream: React.FC<CockpitChatStreamProps> = ({
  messages,
  turnState,
  isListening,
  isProcessing,
  accumulatedTranscript,
  streamingAiText,
  aiTextRef,
  isUserSpeaking,
  audioPlaying,
}) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, accumulatedTranscript, turnState]);

  const visibleMessages = messages.filter(
    (m) => typeof m.content === 'string' && m.agent !== 'coach'
  );

  const lastAiIndex = (() => {
    for (let i = visibleMessages.length - 1; i >= 0; i--) {
      if (visibleMessages[i].role === 'assistant') return i;
    }
    return -1;
  })();

  return (
    <div
      className="flex flex-col gap-4 w-full max-w-2xl mx-auto overflow-y-auto px-6 py-4 scroll-smooth"
      style={{
        maxHeight: 'calc(100vh - 220px)',
        maskImage: 'linear-gradient(to bottom, transparent 0%, black 8%, black 100%)',
        WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 8%, black 100%)',
      }}
    >
      {visibleMessages.map((msg, idx) => {
        const isAI = msg.role === 'assistant';
        const isOld = isAI && idx !== lastAiIndex;
        const text = msg.content as string;

        if (isAI) {
          return (
            <div
              key={idx}
              className="flex items-start gap-3.5 max-w-[90%]"
              style={{ opacity: isOld ? 0.38 : 1, transition: 'opacity 0.4s ease' }}
            >
              <div className="shrink-0 mt-0.5">
                <AICSSOrb state="idle" size="xs" />
              </div>
              <div className="p-3.5 rounded-2xl rounded-tl-sm bg-white/90 border border-gray-100 shadow-sm backdrop-blur-sm">
                <p className="text-[14px] leading-[1.7] text-[#111827] whitespace-pre-wrap break-words">
                  {text}
                </p>
              </div>
            </div>
          );
        }

        return (
          <div key={idx} className="flex justify-end">
            <div className="max-w-[82%] px-4 py-3 rounded-2xl rounded-br-sm bg-gradient-to-br from-[#FEF3C7] to-[#FDE68A]/60 border border-[#EAB308]/40 text-[14px] text-[#111827] leading-relaxed shadow-sm whitespace-pre-wrap break-words">
              {text}
            </div>
          </div>
        );
      })}

      {/* ── Live AI Turn with AICSS Orb ── */}
      {turnState === 'ai' && (
        <div className="flex items-start gap-3.5 max-w-[92%] animate-fade-in">
          <div className="shrink-0 mt-1">
            <AICSSOrb
              state={audioPlaying ? 'speaking' : isProcessing ? 'thinking' : 'thinking'}
              voiceActivity={audioPlaying ? 0.6 : 0.2}
              size="sm"
            />
          </div>
          <div className="flex flex-col gap-2 min-w-0 p-4 rounded-2xl rounded-tl-sm bg-white/95 border border-red-100 shadow-md backdrop-blur-md">
            {/* Status label row */}
            <div className="flex items-center gap-2">
              {audioPlaying ? (
                <>
                  {/* Live audio bars */}
                  <div className="flex gap-[3px] items-end h-3.5">
                    {[1, 1.8, 1.3, 2, 1.5, 1.8, 1].map((h, i) => (
                      <span
                        key={i}
                        className="w-[3px] bg-[#DC2626] rounded-full"
                        style={{
                          height: `${Math.round(h * 5)}px`,
                          animation: 'cockpitBar 0.7s ease-in-out infinite alternate',
                          animationDelay: `${i * 0.09}s`,
                        }}
                      />
                    ))}
                  </div>
                  <span className="text-[11px] font-bold text-[#DC2626] uppercase tracking-widest">
                    AI Speaking
                  </span>
                </>
              ) : (
                <>
                  {/* Thinking status */}
                  <div className="flex gap-[5px] items-center">
                    {[0, 0.18, 0.36].map((d, i) => (
                      <span
                        key={i}
                        className="w-[5px] h-[5px] rounded-full bg-[#8B5CF6] animate-bounce"
                        style={{ animationDelay: `${d}s` }}
                      />
                    ))}
                  </div>
                  <span className="text-[11px] font-bold text-[#8B5CF6] uppercase tracking-widest">
                    Synthesizing response…
                  </span>
                </>
              )}
            </div>

            {/* Streaming transcript */}
            <p className="text-[14px] leading-[1.7] text-[#111827] whitespace-pre-wrap break-words">
              <span ref={aiTextRef} />
              <span className="inline-block w-[3px] h-[15px] bg-[#DC2626] ml-1 align-middle animate-pulse rounded-sm" />
            </p>
          </div>
        </div>
      )}

      {/* ── User speaking / transcript bubble ── */}
      {turnState === 'user' && (isUserSpeaking || accumulatedTranscript) && (
        <div className="flex justify-end animate-fade-in">
          <div className="max-w-[82%] px-4 py-3 rounded-2xl rounded-br-sm bg-gradient-to-br from-[#FEF3C7] to-[#FDE68A]/80 border border-[#EAB308]/50 shadow-sm">
            {accumulatedTranscript ? (
              <p className="text-[14px] text-[#111827] leading-relaxed whitespace-pre-wrap break-words">
                {accumulatedTranscript}
              </p>
            ) : (
              <div className="flex items-center gap-2">
                <div className="flex gap-[3px] items-end h-4">
                  {[1, 1.5, 2, 1.5, 1].map((h, i) => (
                    <span
                      key={i}
                      className="w-1 bg-[#EAB308] rounded-full animate-bounce"
                      style={{ height: `${h * 6}px`, animationDelay: `${i * 0.1}s` }}
                    />
                  ))}
                </div>
                <span className="text-xs font-semibold text-[#92400E]">Listening to your voice…</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Listening indicator ── */}
      {isListening && !isUserSpeaking && turnState !== 'ai' && (
        <div className="flex items-center gap-2 justify-end text-xs text-amber-700 bg-amber-50/70 border border-amber-200/60 px-3 py-1.5 rounded-full w-fit ml-auto shadow-xs">
          <span>Mic active</span>
          <span className="w-2 h-2 rounded-full bg-[#EAB308] animate-ping" />
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
};

export default CockpitChatStream;
