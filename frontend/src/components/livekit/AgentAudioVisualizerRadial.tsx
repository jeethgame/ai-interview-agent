import React, { useEffect, useRef } from 'react';

export interface AgentAudioVisualizerRadialProps {
  state: 'idle' | 'connecting' | 'listening' | 'thinking' | 'speaking';
  voiceActivity?: number; // 0 to 1
  color?: string;
  accentColor?: string;
  className?: string;
}

/**
 * AgentAudioVisualizerRadial
 * Implementation of LiveKit's Radial visualizer style:
 * Dynamic circular spokes radiating from the center, reacting to audio volume and frequency spectrum.
 */
export const AgentAudioVisualizerRadial: React.FC<AgentAudioVisualizerRadialProps> = ({
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
    const spokeCount = 48;
    const spokeHeights = new Float32Array(spokeCount).fill(0.1);

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
      const cx = w / 2;
      const cy = h / 2;
      const innerRadius = Math.min(w, h) * 0.22;
      const maxSpokeLength = Math.min(w, h) * 0.24;

      ctx.clearRect(0, 0, w, h);

      let speed = 0.02;
      let primaryColor = col;
      let secondColor = acc;

      if (st === 'speaking') {
        speed = 0.07 + va * 0.07;
        primaryColor = col;
        secondColor = acc;
      } else if (st === 'thinking') {
        speed = 0.04;
        primaryColor = '#8B5CF6';
        secondColor = '#3B82F6';
      } else if (st === 'listening') {
        speed = 0.035 + va * 0.04;
        primaryColor = '#EAB308';
        secondColor = '#10B981';
      } else if (st === 'connecting') {
        speed = 0.03;
        primaryColor = '#6366F1';
        secondColor = '#06B6D4';
      } else {
        speed = 0.015;
        primaryColor = '#64748B';
        secondColor = '#94A3B8';
      }

      time += speed;

      // Draw center core circle
      ctx.beginPath();
      ctx.arc(cx, cy, innerRadius * 0.9, 0, Math.PI * 2);
      ctx.strokeStyle = primaryColor;
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.35;
      ctx.stroke();

      // Render radial spokes
      for (let i = 0; i < spokeCount; i++) {
        const theta = (i / spokeCount) * Math.PI * 2 + time * 0.4;

        // Target length calculation
        let targetNorm = 0.1;
        if (st === 'speaking') {
          targetNorm = 0.15 + (Math.sin(i * 0.8 + time * 3) * 0.35 + 0.5) * (0.3 + va * 0.7);
        } else if (st === 'thinking') {
          targetNorm = 0.15 + Math.sin(i * 0.4 - time * 4) * 0.25 + 0.25;
        } else if (st === 'listening') {
          targetNorm = 0.12 + (Math.sin(i * 0.6 + time * 2) * 0.2 + 0.2) * (0.4 + va * 0.6);
        } else if (st === 'connecting') {
          targetNorm = 0.1 + Math.sin(i * 0.3 + time * 2) * 0.15;
        } else {
          targetNorm = 0.08 + Math.sin(i * 0.5 + time) * 0.05;
        }

        // Smooth decay / spring
        spokeHeights[i] += (targetNorm - spokeHeights[i]) * 0.25;
        const currentLen = Math.max(3, spokeHeights[i] * maxSpokeLength);

        const x1 = cx + Math.cos(theta) * innerRadius;
        const y1 = cy + Math.sin(theta) * innerRadius;
        const x2 = cx + Math.cos(theta) * (innerRadius + currentLen);
        const y2 = cy + Math.sin(theta) * (innerRadius + currentLen);

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);

        const spokeGrad = ctx.createLinearGradient(x1, y1, x2, y2);
        spokeGrad.addColorStop(0, primaryColor);
        spokeGrad.addColorStop(1, i % 2 === 0 ? secondColor : primaryColor);

        ctx.strokeStyle = spokeGrad;
        ctx.lineWidth = 2.8;
        ctx.lineCap = 'round';
        ctx.shadowColor = secondColor;
        ctx.shadowBlur = spokeHeights[i] > 0.4 ? 8 : 2;
        ctx.globalAlpha = Math.min(1, 0.4 + spokeHeights[i] * 0.6);
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
        maskImage: 'radial-gradient(ellipse at center, black 65%, transparent 95%)',
        WebkitMaskImage: 'radial-gradient(ellipse at center, black 65%, transparent 95%)',
      }}
    />
  );
};

export default AgentAudioVisualizerRadial;
