import React, { useState } from 'react';
import AgentAudioVisualizerAura from './AgentAudioVisualizerAura';
import AgentAudioVisualizerWave from './AgentAudioVisualizerWave';
import AgentAudioVisualizerRadial from './AgentAudioVisualizerRadial';
import AgentAudioVisualizerGrid from './AgentAudioVisualizerGrid';
import AgentAudioVisualizerBar from './AgentAudioVisualizerBar';

export type VisualizerMode = 'grid' | 'aura' | 'wave' | 'radial' | 'bar';

export interface AgentVisualizerContainerProps {
  state: 'idle' | 'connecting' | 'listening' | 'thinking' | 'speaking';
  voiceActivity?: number;
  initialMode?: VisualizerMode;
  showSelector?: boolean;
  color?: string;
  accentColor?: string;
  className?: string;
}

// Icons inspired by LiveKit Agents UI selector
const AuraIcon: React.FC<{ active?: boolean }> = ({ active }) => (
  <svg className="w-4 h-4 shrink-0" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M19.43 5.25C24.04 4.1 28.17 8.38 26.86 12.94L23.59 24.35C22.28 28.92 16.52 30.35 13.21 26.94L4.97 18.4C1.67 14.98 3.31 9.27 7.92 8.12L19.43 5.25Z"
      stroke="currentColor"
      strokeWidth="2.5"
    />
    <path
      d="M8.21 8.01C9.59 3.2 15.66 1.68 19.14 5.28L26.84 13.26C30.32 16.86 28.59 22.87 23.74 24.08L12.98 26.76C8.12 27.97 3.78 23.47 5.16 18.66L8.21 8.01Z"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeDasharray={active ? 'none' : '3 3'}
    />
  </svg>
);

const WaveIcon: React.FC = () => (
  <svg className="w-4 h-4 shrink-0" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M29.33 16C26 13.27 26.25 6.43 23.52 6.43C20.78 6.43 20.78 13.27 17.37 13.27C13.95 13.27 13.95 2.33 10.53 2.33C7.12 2.33 6.32 12.67 2.67 16C6.32 19.33 7.12 29.67 10.53 29.67C13.95 29.67 13.95 18.73 17.37 18.73C20.78 18.73 20.78 25.57 23.52 25.57C26.25 25.57 26 18.67 29.33 16Z"
      stroke="currentColor"
      strokeWidth="2.5"
    />
  </svg>
);

const RadialIcon: React.FC = () => (
  <svg className="w-4 h-4 shrink-0" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M8 1V3.5M8 12.5V15M1 8H3.5M12.5 8H15M3.05 3.05L4.82 4.82M11.18 11.18L12.95 12.95M3.05 12.95L4.82 11.18M11.18 4.82L12.95 3.05"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    />
  </svg>
);

const GridIcon: React.FC = () => (
  <svg className="w-4 h-4 shrink-0" viewBox="0 0 16 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <circle cx="3" cy="3" r="1.5" />
    <circle cx="8" cy="3" r="1.5" />
    <circle cx="13" cy="3" r="1.5" />
    <circle cx="3" cy="8" r="1.5" />
    <circle cx="8" cy="8" r="1.5" />
    <circle cx="13" cy="8" r="1.5" />
    <circle cx="3" cy="13" r="1.5" />
    <circle cx="8" cy="13" r="1.5" />
    <circle cx="13" cy="13" r="1.5" />
  </svg>
);

const BarIcon: React.FC = () => (
  <svg className="w-4 h-4 shrink-0" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M4 1V15M1 6V10M8 4V12M12 2V14M15 6V10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

export const AgentVisualizerContainer: React.FC<AgentVisualizerContainerProps> = ({
  state,
  voiceActivity = 0,
  initialMode = 'grid',
  showSelector = true,
  color = '#DC2626',
  accentColor = '#EAB308',
  className = '',
}) => {
  const [mode, setMode] = useState<VisualizerMode>(initialMode);

  const visualizers: { id: VisualizerMode; label: string; icon: React.ReactNode }[] = [
    { id: 'grid', label: 'Grid', icon: <GridIcon /> },
    { id: 'aura', label: 'Aura', icon: <AuraIcon active={mode === 'aura'} /> },
    { id: 'wave', label: 'Wave', icon: <WaveIcon /> },
    { id: 'radial', label: 'Radial', icon: <RadialIcon /> },
    { id: 'bar', label: 'Spectrum', icon: <BarIcon /> },
  ];

  return (
    <div className={`relative w-full h-full flex flex-col items-center justify-center ${className}`}>
      {/* Visualizer Canvas Area */}
      <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
        {mode === 'grid' && (
          <AgentAudioVisualizerGrid
            state={state}
            voiceActivity={voiceActivity}
            color={color}
            accentColor={accentColor}
          />
        )}
        {mode === 'aura' && (
          <AgentAudioVisualizerAura
            state={state}
            voiceActivity={voiceActivity}
            color={color}
            accentColor={accentColor}
          />
        )}
        {mode === 'wave' && (
          <AgentAudioVisualizerWave
            state={state}
            voiceActivity={voiceActivity}
            color={color}
            accentColor={accentColor}
          />
        )}
        {mode === 'radial' && (
          <AgentAudioVisualizerRadial
            state={state}
            voiceActivity={voiceActivity}
            color={color}
            accentColor={accentColor}
          />
        )}
        {mode === 'bar' && (
          <AgentAudioVisualizerBar
            state={state}
            voiceActivity={voiceActivity}
            color={color}
            accentColor={accentColor}
          />
        )}
      </div>

      {/* Floating LiveKit Style Visualizer Selector Dock */}
      {showSelector && (
        <div className="absolute bottom-2 z-10 flex items-center gap-1 px-2 py-1 rounded-xl bg-white/80 dark:bg-black/60 backdrop-blur-md border border-gray-200/80 dark:border-white/10 shadow-lg shadow-black/5">
          <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-gray-400 px-1.5 hidden sm:inline-block">
            Visualizer
          </span>
          {visualizers.map((v) => {
            const isActive = mode === v.id;
            return (
              <button
                key={v.id}
                type="button"
                onClick={() => setMode(v.id)}
                title={v.label}
                aria-label={v.label}
                className={`relative px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 text-xs font-medium transition-all duration-200 ${
                  isActive
                    ? 'bg-[#DC2626] text-white shadow-sm font-semibold'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100/80 dark:text-gray-300 dark:hover:bg-white/10'
                }`}
              >
                {v.icon}
                <span className="text-[11px] hidden md:inline-block">{v.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default AgentVisualizerContainer;
