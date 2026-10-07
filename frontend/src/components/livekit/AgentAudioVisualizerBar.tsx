import React, { useEffect, useRef } from 'react';

export interface AgentAudioVisualizerBarProps {
  state: 'idle' | 'connecting' | 'listening' | 'thinking' | 'speaking';
  voiceActivity?: number; // 0 to 1
  barCount?: number;
  color?: string;
  accentColor?: string;
  className?: string;
}

/**
 * AgentAudioVisualizerBar
 * Implementation of LiveKit's Bar visualizer style:
 * Dynamic spectrum bars with rounded pill caps, frequency gradient, and spring physics.
 */
export const AgentAudioVisualizerBar: React.FC<AgentAudioVisualizerBarProps> = ({
  state,
  voiceActivity = 0,
  barCount = 32,
  color = '#DC2626',
  accentColor = '#EAB308',
  className = '',
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number>(0);
  const propsRef = useRef({ state, voiceActivity, barCount, color, accentColor });

  propsRef.current = { state, voiceActivity, barCount, color, accentColor };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let time = 0;
    const heights = new Float32Array(barCount).fill(0.08);

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
        barCount: count,
        color: col,
        accentColor: acc,
      } = propsRef.current;

      const w = canvas.width;
      const h = canvas.height;
      const centerY = h * 0.5;
      const maxBarHeight = h * 0.38;

      ctx.clearRect(0, 0, w, h);

      let speed = 0.03;
      let primaryColor = col;
      let secondColor = acc;

      if (st === 'speaking') {
        speed = 0.08 + va * 0.08;
        primaryColor = col;
        secondColor = acc;
      } else if (st === 'thinking') {
        speed = 0.05;
        primaryColor = '#8B5CF6';
        secondColor = '#3B82F6';
      } else if (st === 'listening') {
        speed = 0.04 + va * 0.04;
        primaryColor = '#EAB308';
        secondColor = '#10B981';
      } else if (st === 'connecting') {
        speed = 0.035;
        primaryColor = '#6366F1';
        secondColor = '#06B6D4';
      } else {
        speed = 0.015;
        primaryColor = '#64748B';
        secondColor = '#94A3B8';
      }

      time += speed;

      const totalBarWidth = w * 0.75;
      const barSpacing = totalBarWidth / count;
      const barWidth = Math.max(3, barSpacing * 0.6);
      const startX = (w - totalBarWidth) / 2;

      for (let i = 0; i < count; i++) {
        const normIdx = i / count;
        // Center-weighted bell profile for realistic voice audio spectrum
        const bell = Math.sin(normIdx * Math.PI);

        let target = 0.08;
        if (st === 'speaking') {
          const noise = Math.sin(i * 0.7 + time * 3.5) * 0.3 + Math.cos(i * 1.2 - time * 2) * 0.2;
          target = (0.15 + (noise + 0.5) * (0.3 + va * 0.7)) * bell;
        } else if (st === 'thinking') {
          target = (0.12 + Math.sin(i * 0.4 + time * 4) * 0.25 + 0.25) * bell;
        } else if (st === 'listening') {
          target = (0.1 + (Math.sin(i * 0.5 + time * 2) * 0.2 + 0.2) * (0.3 + va * 0.7)) * bell;
        } else if (st === 'connecting') {
          target = (0.08 + Math.sin(i * 0.3 + time * 2) * 0.15) * bell;
        } else {
          target = (0.05 + Math.sin(i * 0.2 + time) * 0.04) * bell;
        }

        // Spring smoothing
        heights[i] += (target - heights[i]) * 0.22;
        const barH = Math.max(4, heights[i] * maxBarHeight * 2);

        const x = startX + i * barSpacing;
        const y = centerY - barH / 2;

        const grad = ctx.createLinearGradient(x, y, x, y + barH);
        grad.addColorStop(0, primaryColor);
        grad.addColorStop(0.5, secondColor);
        grad.addColorStop(1, primaryColor);

        ctx.fillStyle = grad;
        ctx.shadowColor = secondColor;
        ctx.shadowBlur = heights[i] > 0.3 ? 8 : 2;
        ctx.globalAlpha = Math.min(1, 0.45 + heights[i] * 0.55);

        // Draw rounded pill bar
        const radius = barWidth / 2;
        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barH, radius);
        ctx.fill();
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

export default AgentAudioVisualizerBar;
