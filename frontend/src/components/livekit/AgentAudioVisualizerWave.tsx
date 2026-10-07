import React, { useEffect, useRef } from 'react';

export interface AgentAudioVisualizerWaveProps {
  state: 'idle' | 'connecting' | 'listening' | 'thinking' | 'speaking';
  voiceActivity?: number; // 0 to 1
  color?: string;
  accentColor?: string;
  className?: string;
}

/**
 * AgentAudioVisualizerWave
 * Implementation of LiveKit's Wave visualizer style:
 * Dynamic multi-strand fluid audio ribbons oscillating with speech frequency and amplitude.
 */
export const AgentAudioVisualizerWave: React.FC<AgentAudioVisualizerWaveProps> = ({
  state,
  voiceActivity = 0,
  color = '#DC2626',
  accentColor = '#EAB308',
  className = '',
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number>(0);
  const propsRef = useRef({ state, voiceActivity, color, accentColor });

  propsRef.current = { state, voiceActivity, color, accentColor };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let time = 0;

    const handleResize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      const w = Math.floor(rect.width * dpr);
      const h = Math.floor(rect.height * dpr);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);

    const render = () => {
      const {
        state: st,
        voiceActivity: va,
        color: col,
        accentColor: acc,
      } = propsRef.current;

      const w = canvas.width;
      const h = canvas.height;
      const cy = h / 2;

      ctx.clearRect(0, 0, w, h);

      let speed = 0.03;
      let amp = 15;
      let freq = 0.008;
      let primaryColor = col;
      let secondColor = acc;

      if (st === 'speaking') {
        speed = 0.08 + va * 0.08;
        amp = 25 + va * 60;
        freq = 0.012 + va * 0.006;
        primaryColor = col;
        secondColor = acc;
      } else if (st === 'thinking') {
        speed = 0.05;
        amp = 20;
        freq = 0.018;
        primaryColor = '#8B5CF6';
        secondColor = '#3B82F6';
      } else if (st === 'listening') {
        speed = 0.04 + va * 0.04;
        amp = 18 + va * 40;
        freq = 0.01;
        primaryColor = '#EAB308';
        secondColor = '#10B981';
      } else if (st === 'connecting') {
        speed = 0.04;
        amp = 16;
        freq = 0.009;
        primaryColor = '#6366F1';
        secondColor = '#06B6D4';
      } else {
        speed = 0.018;
        amp = 8;
        freq = 0.006;
        primaryColor = '#64748B';
        secondColor = '#94A3B8';
      }

      time += speed;

      const strands = 4;
      for (let s = 0; s < strands; s++) {
        const strandAmp = amp * (1 - s * 0.18);
        const strandFreq = freq * (1 + s * 0.25);
        const strandPhase = time * (1 + s * 0.3) + s * (Math.PI / 2.5);

        ctx.beginPath();
        for (let x = 0; x <= w; x += 3) {
          // Bell curve attenuation at window boundaries
          const normX = (x / w) * 2 - 1;
          const bell = Math.exp(-normX * normX * 3);

          const y1 = Math.sin(x * strandFreq + strandPhase) * strandAmp;
          const y2 = Math.cos(x * strandFreq * 1.5 - strandPhase * 0.7) * (strandAmp * 0.4);
          const py = cy + (y1 + y2) * bell;

          if (x === 0) {
            ctx.moveTo(x, py);
          } else {
            ctx.lineTo(x, py);
          }
        }

        const grad = ctx.createLinearGradient(0, 0, w, 0);
        grad.addColorStop(0, 'transparent');
        grad.addColorStop(0.2, s % 2 === 0 ? primaryColor : secondColor);
        grad.addColorStop(0.8, s % 2 === 0 ? secondColor : primaryColor);
        grad.addColorStop(1, 'transparent');

        ctx.strokeStyle = grad;
        ctx.lineWidth = 2.5 - s * 0.4;
        ctx.shadowColor = s % 2 === 0 ? primaryColor : secondColor;
        ctx.shadowBlur = 8;
        ctx.globalAlpha = 0.85 - s * 0.18;
        ctx.stroke();
      }

      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1.0;

      rafRef.current = requestAnimationFrame(render);
    };

    rafRef.current = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={`w-full h-full block ${className}`}
      style={{
        maskImage: 'linear-gradient(to right, transparent, black 15%, black 85%, transparent)',
        WebkitMaskImage: 'linear-gradient(to right, transparent, black 15%, black 85%, transparent)',
      }}
    />
  );
};

export default AgentAudioVisualizerWave;
