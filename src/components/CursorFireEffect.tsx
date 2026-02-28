import { useEffect, useRef } from 'react';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
}

/** Parse an HSL string like "258 70% 55%" into h, s, l numbers. */
function parseHslString(hsl: string): { h: number; s: number; l: number } {
  const parts = hsl.trim().split(/\s+/);
  const h = parseFloat(parts[0] ?? '0');
  const s = parseFloat(parts[1] ?? '0');
  const l = parseFloat(parts[2] ?? '50');
  return { h, s, l };
}

/**
 * Renders a canvas overlay that emits fire particles from the cursor (or finger)
 * position, tinted with the current --primary CSS variable color.
 */
export function CursorFireEffect() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const posRef = useRef<{ x: number; y: number } | null>(null);
  const rafRef = useRef<number>(0);
  const activeRef = useRef(false);
  const pulseRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Size canvas to viewport
    function resize() {
      if (!canvas) return;
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener('resize', resize);

    // Track pointer position (mouse + touch)
    function onMouseMove(e: MouseEvent) {
      posRef.current = { x: e.clientX, y: e.clientY };
      activeRef.current = true;
    }
    function onTouchMove(e: TouchEvent) {
      const t = e.touches[0];
      if (t) {
        posRef.current = { x: t.clientX, y: t.clientY };
        activeRef.current = true;
      }
    }
    function onMouseLeave() {
      activeRef.current = false;
    }
    function onTouchEnd() {
      activeRef.current = false;
    }

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('mouseleave', onMouseLeave);
    window.addEventListener('touchend', onTouchEnd);

    function spawnParticles(x: number, y: number) {
      // Spawn 3-5 particles per frame at cursor
      const count = Math.floor(Math.random() * 3) + 3;
      for (let i = 0; i < count; i++) {
        const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.2; // mostly upward
        const speed = (Math.random() * 2.5 + 0.8) * 0.2;
        particlesRef.current.push({
          x: x + (Math.random() - 0.5) * 8,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 1,
          maxLife: 1,
          size: Math.random() * 7 + 4,
        });
      }
    }

    function getPrimaryColor(): { h: number; s: number; l: number } {
      const raw = getComputedStyle(document.documentElement)
        .getPropertyValue('--primary')
        .trim();
      if (!raw) return { h: 30, s: 100, l: 55 }; // warm orange fallback
      return parseHslString(raw);
    }

    function draw() {
      if (!canvas || !ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const { h, s, l } = getPrimaryColor();

      // Spawn new particles if pointer is active
      if (activeRef.current && posRef.current) {
        spawnParticles(posRef.current.x, posRef.current.y);
      }

      // Update + draw particles (original, untouched)
      const next: Particle[] = [];
      for (const p of particlesRef.current) {
        p.life -= 0.005 + Math.random() * 0.002;
        if (p.life <= 0) continue;

        p.x += p.vx;
        p.y += p.vy;
        p.vx += (Math.random() - 0.5) * 0.3; // horizontal flicker
        p.vy -= 0.008; // upward drift (gravity reversed)
        p.size *= 0.97; // shrink

        const t = p.life / p.maxLife; // 1 → 0

        // Color shifts from bright core → dimmer tip as particle ages:
        // young (t≈1): lightness boosted toward white-hot
        // old (t≈0): darkens and fades out
        const particleL = Math.min(95, l + t * 35);
        const particleS = s;
        // Hue shifts slightly toward warmer (red/orange) as it ages
        const particleH = h + (1 - t) * 15;
        const alpha = Math.pow(t, 0.6) * 0.85;

        const radius = Math.max(0.5, p.size * t);

        // Glow: large soft radial gradient
        const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, radius * 2.5);
        glow.addColorStop(0, `hsla(${particleH}, ${particleS}%, ${particleL}%, ${alpha})`);
        glow.addColorStop(0.4, `hsla(${particleH + 8}, ${particleS}%, ${Math.max(l - 10, 20)}%, ${alpha * 0.5})`);
        glow.addColorStop(1, `hsla(${particleH + 15}, ${particleS}%, ${Math.max(l - 20, 10)}%, 0)`);

        ctx.beginPath();
        ctx.arc(p.x, p.y, radius * 2.5, 0, Math.PI * 2);
        ctx.fillStyle = glow;
        ctx.fill();



        next.push(p);
      }
      particlesRef.current = next;

      // Steady soft glow at cursor — slow sine pulse, no randomness
      if (activeRef.current && posRef.current) {
        const { x, y } = posRef.current;
        pulseRef.current += 0.03;
        const pulse = Math.sin(pulseRef.current) * 0.5 + 0.5; // 0 → 1, slow
        const radius = 18 + pulse * 8;
        const alpha = 0.5 + pulse * 0.2;

        const centerGlow = ctx.createRadialGradient(x, y, 0, x, y, radius);
        centerGlow.addColorStop(0,   `hsla(${h}, ${Math.max(s - 20, 0)}%, 92%, ${alpha})`);
        centerGlow.addColorStop(0.5, `hsla(${h}, ${s}%, ${Math.min(l + 15, 90)}%, ${alpha * 0.4})`);
        centerGlow.addColorStop(1,   `hsla(${h}, ${s}%, ${l}%, 0)`);

        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fillStyle = centerGlow;
        ctx.fill();
      }

      rafRef.current = requestAnimationFrame(draw);
    }

    rafRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('mouseleave', onMouseLeave);
      window.removeEventListener('touchend', onTouchEnd);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-[9999]"
      aria-hidden="true"
    />
  );
}
