import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * Drifting, twinkling star particles on a canvas, adapted from Nostrdamus's
 * Bubbles background (itself from the `bubbles` repo, used with permission).
 *
 * Unlike the original fullscreen fixed canvas, this one fills its nearest
 * positioned ancestor, so it can back a single content box. Stars drift,
 * bounce off the walls, spin, twinkle, and shy away from the pointer.
 * Respects prefers-reduced-motion by rendering a single static frame.
 */

interface StarParticle {
  x: number;
  y: number;
  radius: number;
  vx: number;
  vy: number;
  rotation: number;
  spin: number;
  phase: number;
  twinkleSpeed: number;
  color: string;
}

const FALLBACK_COLORS = ["#e7c983", "#c4b5fd", "#e0d7f0"];
const MOUSE_RADIUS = 60;

/**
 * Resolve the star palette from the active theme so the field works on any
 * background: the primary accent plus the muted foreground.
 */
function themeColors(): string[] {
  const style = getComputedStyle(document.documentElement);
  const colors = ["--primary", "--muted-foreground", "--foreground"]
    .map((prop) => style.getPropertyValue(prop).trim())
    .filter(Boolean)
    .map((value) => `hsl(${value})`);
  return colors.length > 0 ? colors : FALLBACK_COLORS;
}

function randRange(a: number, b: number): number {
  return a + Math.random() * (b - a);
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function tracePath(
  ctx: CanvasRenderingContext2D,
  star: StarParticle,
  points = 5,
  inset = 0.5,
) {
  ctx.save();
  ctx.translate(star.x, star.y);
  ctx.rotate(star.rotation);
  ctx.moveTo(star.radius, 0);
  for (let i = 0; i < points * 2; i++) {
    const angle = (Math.PI / points) * i;
    const r = i % 2 === 0 ? star.radius : star.radius * inset;
    ctx.lineTo(r * Math.cos(angle), r * Math.sin(angle));
  }
  ctx.closePath();
  ctx.restore();
}

function spawnStars(width: number, height: number): StarParticle[] {
  const colors = themeColors();
  const count = Math.round(
    Math.min(110, Math.max(35, (width * height) / 8000)),
  );
  return Array.from({ length: count }, () => ({
    x: randRange(2, width - 2),
    y: randRange(2, height - 2),
    radius: randRange(2.5, 7),
    vx: randRange(-0.15, 0.15),
    vy: randRange(-0.15, 0.15),
    rotation: randRange(0, Math.PI * 2),
    spin: randRange(-0.01, 0.01),
    phase: randRange(0, Math.PI * 2),
    twinkleSpeed: randRange(0.01, 0.035),
    color: pick(colors),
  }));
}

export function TarotStars({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    let width = 0;
    let height = 0;
    let stars: StarParticle[] = [];
    let frame = 0;
    let raf = 0;
    const mouse = { x: -9999, y: -9999 };

    const render = () => {
      ctx.clearRect(0, 0, width, height);
      for (const star of stars) {
        const t = frame * star.twinkleSpeed + star.phase;
        const alpha = 0.12 + 0.38 * (Math.sin(t) * 0.5 + 0.5);
        ctx.beginPath();
        tracePath(ctx, star);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = star.color;
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };

    const update = () => {
      for (const star of stars) {
        star.x += star.vx;
        star.y += star.vy;
        star.rotation += star.spin;
        if (star.x < star.radius || star.x > width - star.radius) {
          star.vx *= -1;
        }
        if (star.y < star.radius || star.y > height - star.radius) {
          star.vy *= -1;
        }

        // Shy away from the pointer.
        const dx = star.x - mouse.x;
        const dy = star.y - mouse.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        if (dist < MOUSE_RADIUS + star.radius) {
          const target = MOUSE_RADIUS + star.radius;
          star.x += (dx / dist) * (target - dist) * 0.2;
          star.y += (dy / dist) * (target - dist) * 0.2;
        }
      }
    };

    const step = () => {
      frame++;
      update();
      render();
      raf = requestAnimationFrame(step);
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const prevWidth = width;
      const prevHeight = height;
      width = rect.width;
      height = rect.height;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      if (stars.length === 0 || prevWidth === 0 || prevHeight === 0) {
        stars = spawnStars(width, height);
      } else {
        // Keep relative positions on resize.
        for (const star of stars) {
          star.x = (star.x / prevWidth) * width;
          star.y = (star.y / prevHeight) * height;
        }
      }
      if (reduceMotion) render();
    };

    const onPointerMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
    };

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    // Re-tint the field when the theme changes.
    const themeObserver = new MutationObserver(() => {
      const colors = themeColors();
      for (const star of stars) {
        star.color = pick(colors);
      }
      if (reduceMotion) render();
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style"],
    });

    if (!reduceMotion) {
      window.addEventListener("pointermove", onPointerMove);
      raf = requestAnimationFrame(step);
    }

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      themeObserver.disconnect();
      window.removeEventListener("pointermove", onPointerMove);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={cn("pointer-events-none absolute inset-0 size-full", className)}
      aria-hidden="true"
    />
  );
}
