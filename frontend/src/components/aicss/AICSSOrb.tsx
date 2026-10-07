import React, { useMemo } from 'react';

export type OrbState = 'idle' | 'connecting' | 'listening' | 'thinking' | 'speaking';

export interface AICSSOrbProps {
  state: OrbState;
  voiceActivity?: number; // 0 to 1
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'hero';
  showLabel?: boolean;
  reasoningText?: string;
  className?: string;
}

export const AICSSOrb: React.FC<AICSSOrbProps> = ({
  state,
  voiceActivity = 0,
  size = 'md',
  showLabel = false,
  reasoningText,
  className = '',
}) => {
  // Clamped and smoothed voice reactivity
  const va = Math.min(Math.max(voiceActivity, 0), 1);

  // Size configurations
  const sizeConfig = useMemo(() => {
    switch (size) {
      case 'xs':
        return { orbPx: 16, auraPx: 26, glowPx: 36, textClass: 'text-[10px]' };
      case 'sm':
        return { orbPx: 28, auraPx: 46, glowPx: 64, textClass: 'text-xs' };
      case 'md':
        return { orbPx: 56, auraPx: 96, glowPx: 140, textClass: 'text-sm' };
      case 'lg':
        return { orbPx: 96, auraPx: 160, glowPx: 220, textClass: 'text-base' };
      case 'hero':
      default:
        return { orbPx: 140, auraPx: 240, glowPx: 320, textClass: 'text-base font-semibold' };
    }
  }, [size]);

  // Color schemes and dynamics based on agent state
  const stateTheme = useMemo(() => {
    switch (state) {
      case 'speaking':
        return {
          primary: '#DC2626',      // Theme red
          secondary: '#F59E0B',    // Amber
          accent: '#FEF3C7',
          glow: 'rgba(220, 38, 38, 0.45)',
          halo: 'rgba(245, 158, 11, 0.25)',
          badgeText: 'Speaking',
          badgeBg: 'bg-red-50 text-red-600 border-red-200',
        };
      case 'thinking':
        return {
          primary: '#8B5CF6',      // Purple / Violet reasoning
          secondary: '#3B82F6',    // Blue
          accent: '#C4B5FD',
          glow: 'rgba(139, 92, 246, 0.45)',
          halo: 'rgba(59, 130, 246, 0.25)',
          badgeText: reasoningText || 'Reasoning…',
          badgeBg: 'bg-purple-50 text-purple-600 border-purple-200',
        };
      case 'listening':
        return {
          primary: '#EAB308',      // Gold / Yellow
          secondary: '#10B981',    // Emerald
          accent: '#FEF3C7',
          glow: 'rgba(234, 179, 8, 0.45)',
          halo: 'rgba(16, 185, 129, 0.25)',
          badgeText: 'Listening',
          badgeBg: 'bg-amber-50 text-amber-700 border-amber-200',
        };
      case 'connecting':
        return {
          primary: '#6366F1',      // Indigo
          secondary: '#06B6D4',    // Cyan
          accent: '#E0E7FF',
          glow: 'rgba(99, 102, 241, 0.35)',
          halo: 'rgba(6, 182, 212, 0.2)',
          badgeText: 'Connecting…',
          badgeBg: 'bg-indigo-50 text-indigo-600 border-indigo-200',
        };
      case 'idle':
      default:
        return {
          primary: '#64748B',      // Slate
          secondary: '#94A3B8',
          accent: '#F1F5F9',
          glow: 'rgba(100, 116, 139, 0.25)',
          halo: 'rgba(148, 163, 184, 0.15)',
          badgeText: 'Standby',
          badgeBg: 'bg-slate-50 text-slate-600 border-slate-200',
        };
    }
  }, [state, reasoningText]);

  // Dynamic scale from audio
  const audioBoost = state === 'speaking' ? 1 + va * 0.35 : state === 'listening' ? 1 + va * 0.2 : 1;

  return (
    <div className={`relative inline-flex flex-col items-center justify-center select-none ${className}`}>
      {/* Outer ambient glow field */}
      <div
        className="absolute rounded-full pointer-events-none transition-all duration-300 blur-2xl"
        style={{
          width: sizeConfig.glowPx,
          height: sizeConfig.glowPx,
          background: `radial-gradient(circle, ${stateTheme.glow} 0%, ${stateTheme.halo} 50%, transparent 75%)`,
          transform: `scale(${audioBoost})`,
          opacity: state === 'idle' ? 0.4 : 0.85,
        }}
      />

      {/* Outer rotating resonant orbital ring (for hero & lg) */}
      {(size === 'hero' || size === 'lg') && (
        <>
          <div
            className="absolute rounded-full border border-dashed pointer-events-none transition-all duration-500 animate-[spin_16s_linear_infinite]"
            style={{
              width: sizeConfig.auraPx,
              height: sizeConfig.auraPx,
              borderColor: stateTheme.primary,
              opacity: state === 'thinking' ? 0.6 : 0.25,
              transform: `scale(${audioBoost * 1.05})`,
            }}
          />
          <div
            className="absolute rounded-full border border-dotted pointer-events-none transition-all duration-500 animate-[spin_24s_linear_infinite_reverse]"
            style={{
              width: sizeConfig.auraPx * 0.85,
              height: sizeConfig.auraPx * 0.85,
              borderColor: stateTheme.secondary,
              opacity: state === 'thinking' || state === 'speaking' ? 0.45 : 0.2,
            }}
          />
        </>
      )}

      {/* Main interactive Orb body */}
      <div
        className="relative rounded-full flex items-center justify-center shadow-2xl transition-transform duration-150 ease-out overflow-hidden"
        style={{
          width: sizeConfig.orbPx,
          height: sizeConfig.orbPx,
          transform: `scale(${audioBoost})`,
          boxShadow: `0 0 25px ${stateTheme.glow}, inset 0 0 15px rgba(255, 255, 255, 0.4)`,
        }}
      >
        {/* Layer 1: Base chromatic gradient with rotation */}
        <div
          className="absolute inset-0 rounded-full animate-[spin_10s_linear_infinite]"
          style={{
            background: `conic-gradient(from 0deg, ${stateTheme.primary}, ${stateTheme.secondary}, ${stateTheme.accent}, ${stateTheme.primary})`,
            filter: 'blur(2px)',
          }}
        />

        {/* Layer 2: Inner glowing breathing sphere */}
        <div
          className="absolute inset-[3px] rounded-full transition-opacity duration-300"
          style={{
            background: `radial-gradient(circle at 35% 35%, rgba(255,255,255,0.85) 0%, ${stateTheme.primary} 45%, ${stateTheme.secondary} 85%, #111827 100%)`,
          }}
        />

        {/* Layer 3: Pulse ripple core */}
        <div
          className="absolute inset-0 rounded-full animate-ping opacity-20 pointer-events-none"
          style={{
            backgroundColor: stateTheme.primary,
            animationDuration: state === 'thinking' ? '1.5s' : state === 'speaking' ? '1.2s' : '3s',
          }}
        />

        {/* Layer 4: Glass specular shine highlight */}
        <div
          className="absolute top-1 left-2 rounded-full pointer-events-none opacity-80"
          style={{
            width: sizeConfig.orbPx * 0.35,
            height: sizeConfig.orbPx * 0.2,
            background: 'radial-gradient(ellipse at center, rgba(255,255,255,0.9) 0%, transparent 80%)',
            transform: 'rotate(-25deg)',
          }}
        />

        {/* Miniature state sparkles for thinking state */}
        {state === 'thinking' && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
          </div>
        )}
      </div>

      {/* Optional Activity Badge Label */}
      {showLabel && (
        <div className="mt-3 flex items-center gap-1.5 z-10">
          <span
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold tracking-wide border shadow-sm transition-all duration-300 ${stateTheme.badgeBg}`}
          >
            <span
              className="w-2 h-2 rounded-full animate-pulse"
              style={{ backgroundColor: stateTheme.primary }}
            />
            {stateTheme.badgeText}
          </span>
        </div>
      )}
    </div>
  );
};

export default AICSSOrb;
