import React, { useEffect, useRef } from 'react';

export interface AgentAudioVisualizerAuraProps {
  state: 'idle' | 'connecting' | 'listening' | 'thinking' | 'speaking';
  voiceActivity?: number; // 0 to 1
  color?: string;
  accentColor?: string;
  className?: string;
}

/**
 * AgentAudioVisualizerAura
 * Implementation of LiveKit's Aura visualizer style:
 * Dynamic fluid concentric harmonic aura rings that warp and breathe with audio frequencies.
 */
export const AgentAudioVisualizerAura: React.FC<AgentAudioVisualizerAuraProps> = ({
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
      const cx = w / 2;
      const cy = h / 2;
      const baseRadius = Math.min(w, h) * 0.22;

      ctx.clearRect(0, 0, w, h);

      let speed = 0.02;
      let auraAmp = 0.15;
      let layers = 5;
      let primaryColor = col;
      let secondColor = acc;

      if (st === 'speaking') {
        speed = 0.05 + va * 0.05;
        auraAmp = 0.3 + va * 0.6;
        primaryColor = col;
        secondColor = acc;
      } else if (st === 'thinking') {
        speed = 0.035;
        auraAmp = 0.25;
        primaryColor = '#8B5CF6';
        secondColor = '#3B82F6';
      } else if (st === 'listening') {
        speed = 0.03 + va * 0.04;
        auraAmp = 0.2 + va * 0.4;
        primaryColor = '#EAB308';
        secondColor = '#10B981';
      } else if (st === 'connecting') {
        speed = 0.03;
        auraAmp = 0.18;
        primaryColor = '#6366F1';
        secondColor = '#06B6D4';
      } else {
        speed = 0.015;
        auraAmp = 0.08;
        primaryColor = '#64748B';
        secondColor = '#94A3B8';
      }

      time += speed;

      // Draw layered concentric aura rings
      for (let l = 0; l < layers; l++) {
        const ringRadius = baseRadius * (1 + l * 0.28);
        const points = 64;
        const phaseOffset = (l * Math.PI) / 3;

        ctx.beginPath();
        for (let i = 0; i <= points; i++) {
          const theta = (i / points) * Math.PI * 2;
          const harmonic1 = Math.sin(theta * 3 + time * 2 + phaseOffset);
          const harmonic2 = Math.cos(theta * 5 - time * 1.5);
          const harmonic3 = Math.sin(theta * 2 + time * 3.5);

          const displacement = (harmonic1 * 0.5 + harmonic2 * 0.3 + harmonic3 * 0.2) * auraAmp * ringRadius;
          const r = ringRadius + displacement;

          const px = cx + Math.cos(theta) * r;
          const py = cy + Math.sin(theta) * r;

          if (i === 0) {
            ctx.moveTo(px, py);
          } else {
            ctx.lineTo(px, py);
          }
        }
        ctx.closePath();

        const grad = ctx.createRadialGradient(cx, cy, ringRadius * 0.7, cx, cy, ringRadius * 1.4);
        grad.addColorStop(0, l % 2 === 0 ? primaryColor : secondColor);
        grad.addColorStop(1, 'transparent');

        ctx.strokeStyle = grad;
        ctx.lineWidth = 2.5 - l * 0.3;
        ctx.shadowColor = l % 2 === 0 ? primaryColor : secondColor;
        ctx.shadowBlur = 12;
        ctx.globalAlpha = Math.max(0.15, 0.75 - l * 0.12);
        ctx.stroke();

        // Fill innermost ring with subtle glow
        if (l === 0) {
          ctx.fillStyle = primaryColor;
          ctx.globalAlpha = 0.08 + (st === 'speaking' ? va * 0.15 : 0.05);
          ctx.fill();
        }
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
        maskImage: 'radial-gradient(ellipse at center, black 60%, transparent 95%)',
        WebkitMaskImage: 'radial-gradient(ellipse at center, black 60%, transparent 95%)',
      }}
    />
  );
};

export default AgentAudioVisualizerAura;
