import { useEffect, useRef, memo } from 'react';

import type { PrecipitationIntensity, PrecipitationType } from '@/hooks/useWeather';

interface PrecipitationEffectProps {
  type: PrecipitationType;
  intensity: PrecipitationIntensity;
}

// ---------------------------------------------------------------------------
// Particle pool sizes by intensity
// ---------------------------------------------------------------------------

const RAIN_COUNT: Record<PrecipitationIntensity, number> = {
  light: 80,
  moderate: 160,
  heavy: 280,
};

const SNOW_COUNT: Record<PrecipitationIntensity, number> = {
  light: 50,
  moderate: 100,
  heavy: 180,
};

// ---------------------------------------------------------------------------
// Raindrop particle
// ---------------------------------------------------------------------------

interface RainDrop {
  x: number;
  y: number;
  speed: number;
  length: number;
  opacity: number;
  drift: number;
}

function createRainDrop(w: number, h: number, intensity: PrecipitationIntensity): RainDrop {
  const speedBase = intensity === 'heavy' ? 14 : intensity === 'moderate' ? 10 : 7;
  const speedRange = intensity === 'heavy' ? 8 : intensity === 'moderate' ? 5 : 3;
  return {
    x: Math.random() * (w + 100) - 50,
    y: Math.random() * h * -1 - 20,
    speed: speedBase + Math.random() * speedRange,
    length: intensity === 'heavy' ? 18 + Math.random() * 12 : 10 + Math.random() * 10,
    opacity: 0.15 + Math.random() * 0.2,
    drift: intensity === 'heavy' ? 1.5 + Math.random() : 0.5 + Math.random() * 0.8,
  };
}

// ---------------------------------------------------------------------------
// Snowflake particle
// ---------------------------------------------------------------------------

interface SnowFlake {
  x: number;
  y: number;
  speed: number;
  radius: number;
  opacity: number;
  wobbleAmp: number;
  wobbleFreq: number;
  wobblePhase: number;
}

function createSnowFlake(w: number, h: number, intensity: PrecipitationIntensity): SnowFlake {
  const sizeBase = intensity === 'heavy' ? 2.5 : intensity === 'moderate' ? 2 : 1.5;
  const sizeRange = intensity === 'heavy' ? 3 : intensity === 'moderate' ? 2.5 : 2;
  return {
    x: Math.random() * (w + 60) - 30,
    y: Math.random() * h * -1 - 10,
    speed: 0.5 + Math.random() * (intensity === 'heavy' ? 1.8 : intensity === 'moderate' ? 1.2 : 0.8),
    radius: sizeBase + Math.random() * sizeRange,
    opacity: 0.4 + Math.random() * 0.4,
    wobbleAmp: 0.3 + Math.random() * 0.8,
    wobbleFreq: 0.01 + Math.random() * 0.02,
    wobblePhase: Math.random() * Math.PI * 2,
  };
}

// ---------------------------------------------------------------------------
// Canvas precipitation renderer
// ---------------------------------------------------------------------------

export const PrecipitationEffect = memo(function PrecipitationEffect({
  type,
  intensity,
}: PrecipitationEffectProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);
  const rainDrops = useRef<RainDrop[]>([]);
  const snowFlakes = useRef<SnowFlake[]>([]);
  const frameRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !type) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    function resize() {
      if (!canvas) return;
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener('resize', resize);

    // Initialize particle pools
    const w = canvas.width;
    const h = canvas.height;

    if (type === 'rain') {
      const count = RAIN_COUNT[intensity];
      rainDrops.current = [];
      for (let i = 0; i < count; i++) {
        const drop = createRainDrop(w, h, intensity);
        // Scatter initial y positions across the screen for instant coverage
        drop.y = Math.random() * h;
        rainDrops.current.push(drop);
      }
    } else {
      const count = SNOW_COUNT[intensity];
      snowFlakes.current = [];
      for (let i = 0; i < count; i++) {
        const flake = createSnowFlake(w, h, intensity);
        flake.y = Math.random() * h;
        snowFlakes.current.push(flake);
      }
    }

    function drawRain() {
      if (!canvas || !ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (const drop of rainDrops.current) {
        drop.y += drop.speed;
        drop.x += drop.drift;

        // Reset when off screen
        if (drop.y > canvas.height + 20) {
          drop.y = -drop.length - Math.random() * 40;
          drop.x = Math.random() * (canvas.width + 100) - 50;
        }
        if (drop.x > canvas.width + 50) {
          drop.x = -50;
        }

        // Draw the raindrop as a thin line with a subtle glow
        ctx.beginPath();
        ctx.moveTo(drop.x, drop.y);
        ctx.lineTo(drop.x + drop.drift * 0.5, drop.y + drop.length);
        ctx.strokeStyle = `rgba(174, 194, 224, ${drop.opacity})`;
        ctx.lineWidth = 1.2;
        ctx.lineCap = 'round';
        ctx.stroke();
      }

      rafRef.current = requestAnimationFrame(drawRain);
    }

    function drawSnow() {
      if (!canvas || !ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      frameRef.current++;

      for (const flake of snowFlakes.current) {
        flake.y += flake.speed;
        flake.x += Math.sin(frameRef.current * flake.wobbleFreq + flake.wobblePhase) * flake.wobbleAmp;

        // Reset when off screen
        if (flake.y > canvas.height + 10) {
          flake.y = -flake.radius * 2 - Math.random() * 30;
          flake.x = Math.random() * (canvas.width + 60) - 30;
        }
        if (flake.x > canvas.width + 30) {
          flake.x = -30;
        } else if (flake.x < -30) {
          flake.x = canvas.width + 30;
        }

        // Draw the snowflake as a soft glowing circle
        ctx.beginPath();
        ctx.arc(flake.x, flake.y, flake.radius, 0, Math.PI * 2);

        const gradient = ctx.createRadialGradient(
          flake.x, flake.y, 0,
          flake.x, flake.y, flake.radius,
        );
        gradient.addColorStop(0, `rgba(255, 255, 255, ${flake.opacity})`);
        gradient.addColorStop(0.5, `rgba(230, 238, 255, ${flake.opacity * 0.6})`);
        gradient.addColorStop(1, `rgba(210, 225, 250, 0)`);

        ctx.fillStyle = gradient;
        ctx.fill();
      }

      rafRef.current = requestAnimationFrame(drawSnow);
    }

    if (type === 'rain') {
      rafRef.current = requestAnimationFrame(drawRain);
    } else {
      rafRef.current = requestAnimationFrame(drawSnow);
    }

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', resize);
      rainDrops.current = [];
      snowFlakes.current = [];
    };
  }, [type, intensity]);

  if (!type) return null;

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-[110]"
      aria-hidden="true"
    />
  );
});
