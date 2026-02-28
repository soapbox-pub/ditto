import { useEffect, useRef } from 'react';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  size: number;
}

interface Ring {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  life: number; // 1 → 0
}

function parseHslString(hsl: string): { h: number; s: number; l: number } {
  const parts = hsl.trim().split(/\s+/);
  return {
    h: parseFloat(parts[0] ?? '30'),
    s: parseFloat(parts[1] ?? '100'),
    l: parseFloat(parts[2] ?? '55'),
  };
}

export function CursorFireEffect() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particles = useRef<Particle[]>([]);
  const rings = useRef<Ring[]>([]);
  const cursor = useRef<{ x: number; y: number } | null>(null);
  const active = useRef(false);
  const raf = useRef(0);
  const pulse = useRef(0);
  const frame = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    function resize() {
      if (!canvas) return;
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener('resize', resize);

    function onMouseMove(e: MouseEvent) {
      cursor.current = { x: e.clientX, y: e.clientY };
      active.current = true;
    }
    function onTouchMove(e: TouchEvent) {
      const t = e.touches[0];
      if (t) { cursor.current = { x: t.clientX, y: t.clientY }; active.current = true; }
    }
    function onLeave() { active.current = false; }

    function onClick(e: MouseEvent) {
      spawnClickBurst(e.clientX, e.clientY);
    }
    function onTouchStart(e: TouchEvent) {
      const t = e.touches[0];
      if (t) spawnClickBurst(t.clientX, t.clientY);
    }

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('mouseleave', onLeave);
    window.addEventListener('touchend', onLeave);
    window.addEventListener('click', onClick);
    window.addEventListener('touchstart', onTouchStart, { passive: true });

    function getPrimary() {
      const raw = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim();
      return raw ? parseHslString(raw) : { h: 270, s: 80, l: 60 };
    }

    function spawnWispParticles(x: number, y: number) {
      const count = Math.floor(Math.random() * 2) + 2;
      for (let i = 0; i < count; i++) {
        const angle = -Math.PI / 2 + (Math.random() - 0.5) * 0.3;
        const speed = Math.random() * 0.6 + 0.3;
        particles.current.push({
          x: x + (Math.random() - 0.5) * 6,
          y,
          vx: Math.cos(angle) * speed * 0.2,
          vy: Math.sin(angle) * speed,
          life: 1,
          size: Math.random() * 28 + 20,
        });
      }
    }

    function spawnClickBurst(x: number, y: number) {
      // Expanding shockwave ring
      rings.current.push({ x, y, radius: 0, maxRadius: 120, life: 1 });

      // Secondary smaller ring
      rings.current.push({ x, y, radius: 0, maxRadius: 60, life: 1 });

      // Radial burst of particles in all directions
      const count = 18;
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2;
        const speed = Math.random() * 3.5 + 1.5;
        particles.current.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 1,
          size: Math.random() * 20 + 12,
        });
      }

      // Extra upward plume
      for (let i = 0; i < 8; i++) {
        const angle = -Math.PI / 2 + (Math.random() - 0.5) * 0.8;
        const speed = Math.random() * 4 + 2;
        particles.current.push({
          x: x + (Math.random() - 0.5) * 10,
          y,
          vx: Math.cos(angle) * speed * 0.3,
          vy: Math.sin(angle) * speed,
          life: 1,
          size: Math.random() * 30 + 18,
        });
      }
    }

    function draw() {
      if (!canvas || !ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const { h, s, l } = getPrimary();

      // Spawn wisp particles every 4th frame
      frame.current++;
      if (active.current && cursor.current && frame.current % 4 === 0) {
        spawnWispParticles(cursor.current.x, cursor.current.y);
      }

      ctx.globalCompositeOperation = 'screen';

      // Draw expanding rings
      const aliveRings: Ring[] = [];
      for (const r of rings.current) {
        r.life -= 0.022;
        if (r.life <= 0) continue;
        r.radius += (r.maxRadius - r.radius) * 0.08;

        const t = r.life;
        const lineAlpha = Math.pow(t, 1.5) * 0.8;
        const glowAlpha = Math.pow(t, 2) * 0.4;
        const lineWidth = t * 3;

        // Outer glow halo
        ctx.beginPath();
        ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2);
        ctx.strokeStyle = `hsla(${h}, ${s}%, ${Math.min(l + 20, 85)}%, ${glowAlpha})`;
        ctx.lineWidth = lineWidth + 8;
        ctx.stroke();

        // Sharp ring
        ctx.beginPath();
        ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2);
        ctx.strokeStyle = `hsla(${h - 10}, ${s}%, 90%, ${lineAlpha})`;
        ctx.lineWidth = lineWidth;
        ctx.stroke();

        aliveRings.push(r);
      }
      rings.current = aliveRings;

      // Draw flame particles
      const alive: Particle[] = [];
      for (const p of particles.current) {
        p.life -= 0.005 + Math.random() * 0.002;
        if (p.life <= 0) continue;

        p.x += p.vx;
        p.y += p.vy;
        p.vy -= 0.018;
        p.vx *= 0.98;
        p.size *= 0.985;

        const t = p.life;
        const ph = h + (1 - t) * 25;
        const pl = Math.min(l + t * 40, 90);
        const alpha = Math.pow(t, 1.5) * 0.18;
        const radius = p.size * (0.4 + t * 0.6);

        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, radius);
        g.addColorStop(0,    `hsla(${ph - 5},  ${s}%, ${pl}%, ${alpha})`);
        g.addColorStop(0.35, `hsla(${ph},      ${s}%, ${Math.max(l, 40)}%, ${alpha * 0.6})`);
        g.addColorStop(0.7,  `hsla(${ph + 15}, ${s}%, ${Math.max(l - 15, 20)}%, ${alpha * 0.2})`);
        g.addColorStop(1,    `hsla(${ph + 25}, ${s}%, ${Math.max(l - 25, 5)}%, 0)`);

        ctx.beginPath();
        ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = g;
        ctx.fill();

        alive.push(p);
      }
      particles.current = alive;

      // Orb: slow pulsing core glow at cursor
      if (active.current && cursor.current) {
        const { x, y } = cursor.current;
        pulse.current += 0.025;
        const pv = (Math.sin(pulse.current) + 1) / 2;
        const r = 20 + pv * 12;
        const a = 0.5 + pv * 0.3;

        const orb = ctx.createRadialGradient(x, y, 0, x, y, r);
        orb.addColorStop(0,   `hsla(${h - 10}, ${Math.max(s - 10, 0)}%, 95%, ${a})`);
        orb.addColorStop(0.4, `hsla(${h},      ${s}%, ${Math.min(l + 15, 85)}%, ${a * 0.5})`);
        orb.addColorStop(1,   `hsla(${h + 15}, ${s}%, ${l}%, 0)`);

        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = orb;
        ctx.fill();
      }

      ctx.globalCompositeOperation = 'source-over';
      raf.current = requestAnimationFrame(draw);
    }

    raf.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf.current);
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('mouseleave', onLeave);
      window.removeEventListener('touchend', onLeave);
      window.removeEventListener('click', onClick);
      window.removeEventListener('touchstart', onTouchStart);
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
