import React, { useEffect, useRef } from 'react';

export interface AgentAudioVisualizerGridProps {
  state: 'idle' | 'connecting' | 'listening' | 'thinking' | 'speaking';
  voiceActivity?: number; // 0 to 1
  rows?: number;
  cols?: number;
  color?: string;
  accentColor?: string;
  className?: string;
}

/**
 * AgentAudioVisualizerGrid
 * Implementation of LiveKit's grid audio visualizer (agent-audio-visualizer-grid):
 * An audio visualization of a grid of particles oscillating in 3D/2.5D space.
 * Responds to agent state: connecting, listening, thinking, speaking.
 */
export const AgentAudioVisualizerGrid: React.FC<AgentAudioVisualizerGridProps> = ({
  state,
  voiceActivity = 0,
  rows = 18,
  cols = 28,
  color = '#DC2626',
  accentColor = '#EAB308',
  className = '',
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number>(0);
  const propsRef = useRef({ state, voiceActivity, rows, cols, color, accentColor });

  propsRef.current = { state, voiceActivity, rows, cols, color, accentColor };

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
        rows: r,
        cols: c,
        color: col,
        accentColor: acc,
      } = propsRef.current;

      const w = canvas.width;
      const h = canvas.height;

      ctx.clearRect(0, 0, w, h);

      // Speed and wave dynamics based on state
      let speed = 0.02;
      let amp = 0.15;
      let freq = 0.4;
      let primaryColor = col;
      let secondColor = acc;

      if (st === 'speaking') {
        speed = 0.06 + va * 0.06;
        amp = 0.4 + va * 0.8;
        freq = 0.5 + va * 0.3;
        primaryColor = col; // red
        secondColor = acc; // gold
      } else if (st === 'thinking') {
        speed = 0.04;
        amp = 0.28;
        freq = 0.7;
        primaryColor = '#8B5CF6'; // purple
        secondColor = '#3B82F6';  // blue
      } else if (st === 'listening') {
        speed = 0.03 + va * 0.04;
        amp = 0.25 + va * 0.6;
        freq = 0.45;
        primaryColor = '#EAB308'; // gold
        secondColor = '#10B981';  // emerald
      } else if (st === 'connecting') {
        speed = 0.035;
        amp = 0.2;
        freq = 0.35;
        primaryColor = '#6366F1'; // indigo
        secondColor = '#06B6D4';  // cyan
      } else {
        // idle
        speed = 0.012;
        amp = 0.1;
        freq = 0.3;
        primaryColor = '#64748B';
        secondColor = '#94A3B8';
      }

      time += speed;

      // Center perspective transformation
      const centerX = w / 2;
      const centerY = h * 0.55;
      const spacingX = w / (c + 1);
      const spacingY = h / (r + 1);

      const fov = 300;

      // Draw particle grid
      for (let i = 0; i < r; i++) {
        for (let j = 0; j < c; j++) {
          // Normalized grid coordinate (-1 to 1)
          const nx = (j - c / 2) / (c / 2);
          const ny = (i - r / 2) / (r / 2);

          const dist = Math.sqrt(nx * nx + ny * ny);

          // Wave displacement calculation
          let wave = 0;
          if (st === 'thinking') {
            // Diagonal cyber wave
            wave = Math.sin((nx + ny) * freq * 5 + time * 3) * amp;
          } else if (st === 'listening' || st === 'speaking') {
            // Ripple concentric + linear wave
            wave = (Math.sin(dist * freq * 8 - time * 4) + Math.cos(nx * 4 + time * 2)) * 0.5 * amp;
          } else {
            // Ambient calm undulation
            wave = (Math.sin(nx * freq * 4 + time) * Math.cos(ny * freq * 4 + time)) * amp;
          }

          // 2.5D perspective projection
          const elevation = wave * 45;
          const px = centerX + (j - c / 2 + 0.5) * spacingX * 1.1;
          const py = centerY + (i - r / 2 + 0.5) * spacingY * 0.85 - elevation;

          // Particle radius with audio-reactive boost
          const baseRadius = 2.0;
          const radiusScale = Math.max(0.6, 1 + wave * 1.2 + (st === 'speaking' ? va * 1.5 : 0));
          const currentRadius = baseRadius * radiusScale;

          // Alpha fade near edges
          const edgeFade = Math.max(0, 1 - dist * 0.95);
          const alpha = Math.min(1, Math.max(0.12, (0.4 + wave * 0.5) * edgeFade));

          // Interpolate particle color
          ctx.beginPath();
          ctx.arc(px, py, currentRadius, 0, Math.PI * 2);

          if (wave > 0.15) {
            ctx.fillStyle = secondColor;
            ctx.shadowColor = secondColor;
            ctx.shadowBlur = 6 * radiusScale;
          } else {
            ctx.fillStyle = primaryColor;
            ctx.shadowColor = primaryColor;
            ctx.shadowBlur = 3;
          }

          ctx.globalAlpha = alpha;
          ctx.fill();

          // Connect subtle lattice line between adjacent points for rich depth
          if (j < c - 1 && edgeFade > 0.3) {
            const nextWave = (Math.sin(((j + 1 - c / 2) / (c / 2)) * freq * 4 + time)) * amp;
            const nextPx = centerX + (j + 1 - c / 2 + 0.5) * spacingX * 1.1;
            const nextPy = centerY + (i - r / 2 + 0.5) * spacingY * 0.85 - nextWave * 45;

            ctx.beginPath();
            ctx.moveTo(px, py);
            ctx.lineTo(nextPx, nextPy);
            ctx.strokeStyle = primaryColor;
            ctx.lineWidth = 0.5;
            ctx.globalAlpha = alpha * 0.15;
            ctx.stroke();
          }
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
        maskImage: 'radial-gradient(ellipse at center, black 50%, transparent 95%)',
        WebkitMaskImage: 'radial-gradient(ellipse at center, black 50%, transparent 95%)',
      }}
    />
  );
};

export default AgentAudioVisualizerGrid;
