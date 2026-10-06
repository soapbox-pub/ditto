/**
 * Paper textures — Canvas 2D generators for the papercraft room.
 *
 * - `drawSurface` paints a wall or floor layout (validated palette + enum
 *   style/variant) in world pixels, with paper fibre on top.
 * - `paperBump` is a tileable crumple map that makes lit surfaces read as paper.
 *
 * No event data reaches a canvas except validated hex colors.
 */

import type { RoomSurfaceLayout } from '../room-layout-schema';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

function context(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D unavailable');
  return ctx;
}

/** Deterministic PRNG so textures don't shimmer between rebuilds. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  // Palettes are validated hex (see room-layout-schema.ts)
  const n = parseInt(h.slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgb([r, g, b]: [number, number, number], alpha = 1): string {
  return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${alpha})`;
}

function shade(color: [number, number, number], factor: number): [number, number, number] {
  return [color[0] * factor, color[1] * factor, color[2] * factor];
}

function mix(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** CSS-style gradient endpoints for an angle across a w×h rect. */
function gradientLine(w: number, h: number, angleDeg: number): [number, number, number, number] {
  const a = (angleDeg * Math.PI) / 180;
  const dx = Math.sin(a);
  const dy = -Math.cos(a);
  const half = (Math.abs(w * dx) + Math.abs(h * dy)) / 2;
  const cx = w / 2;
  const cy = h / 2;
  return [cx - dx * half, cy - dy * half, cx + dx * half, cy + dy * half];
}

// ─── Paper fibre ──────────────────────────────────────────────────────────────

/** Sprinkle short fibres and speckles so flat colour reads as paper. */
function drawFibre(ctx: CanvasRenderingContext2D, w: number, h: number, unit: number, seed: number) {
  const rand = rng(seed);
  const count = Math.round((w * h) / (220 * unit * unit));
  ctx.save();
  ctx.lineCap = 'round';
  for (let i = 0; i < count; i++) {
    const x = rand() * w;
    const y = rand() * h;
    const len = (2 + rand() * 7) * unit;
    const a = rand() * Math.PI;
    const light = rand() > 0.5;
    ctx.strokeStyle = light ? `rgba(255,255,255,${0.05 + rand() * 0.08})` : `rgba(60,40,20,${0.025 + rand() * 0.04})`;
    ctx.lineWidth = (0.4 + rand() * 0.6) * unit;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    ctx.stroke();
  }
  ctx.restore();
}

// ─── Surfaces ─────────────────────────────────────────────────────────────────

/**
 * Paint a surface layout into a canvas of `width`×`height` world px, at
 * `pxPerUnit` canvas pixels per world px. Floors are painted as seen from
 * above (planks and tiles are true rectangles; the 3D floor adds perspective).
 */
export function drawSurface(
  surface: RoomSurfaceLayout,
  width: number,
  height: number,
  pxPerUnit: number,
  seed: number,
): HTMLCanvasElement {
  const canvas = makeCanvas(width * pxPerUnit, height * pxPerUnit);
  const ctx = context(canvas);
  const w = canvas.width;
  const h = canvas.height;
  const u = pxPerUnit;
  const a = hexToRgb(surface.palette[0]);
  const hasB = !!surface.palette[1];
  const b = hasB ? hexToRgb(surface.palette[1]) : shade(a, 0.82);
  const angle = surface.angle ?? 0;
  const rand = rng(seed * 7919);

  ctx.fillStyle = rgb(a);
  ctx.fillRect(0, 0, w, h);

  switch (surface.style) {
    case 'gradient':
    case 'carpet': {
      if (!hasB) break;
      const [x0, y0, x1, y1] = gradientLine(w, h, angle || (surface.style === 'carpet' ? 135 : 180));
      const g = ctx.createLinearGradient(x0, y0, x1, y1);
      g.addColorStop(0, rgb(a));
      g.addColorStop(1, rgb(b));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      if (surface.style === 'carpet') {
        // Tufted pile: dense soft dots in light and shade
        const strength = surface.variant === 'soft' ? 0.6 : surface.variant === 'bold' ? 1.4 : 1;
        const count = Math.round((w * h) / (5 * u * u));
        for (let i = 0; i < count; i++) {
          const light = rand() > 0.5;
          ctx.fillStyle = light ? `rgba(255,255,255,${0.05 * strength})` : `rgba(0,0,0,${0.06 * strength})`;
          ctx.beginPath();
          ctx.arc(rand() * w, rand() * h, (0.6 + rand() * 1.1) * u, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      break;
    }

    case 'stripes': {
      const size = (surface.variant === 'narrow' ? 8 : surface.variant === 'wide' ? 24 : 14) * u * 1.2;
      const contrast = surface.variant === 'soft' ? 0.56 : surface.variant === 'bold' ? 1 : 0.8;
      ctx.save();
      ctx.translate(w / 2, h / 2);
      ctx.rotate((((angle || 180) - 180) * Math.PI) / 180);
      const span = Math.hypot(w, h);
      ctx.fillStyle = rgb(mix(a, b, contrast));
      for (let y = -span / 2; y < span / 2; y += size * 2) {
        ctx.fillRect(-span / 2, y + size, span, size);
      }
      ctx.restore();
      break;
    }

    case 'dots': {
      const grid = 22 * u;
      const r = 3.2 * u;
      const off = (angle * Math.PI) / 180;
      ctx.fillStyle = rgb(b);
      for (let y = -grid; y < h + grid; y += grid) {
        for (let x = -grid; x < w + grid; x += grid) {
          ctx.beginPath();
          ctx.arc(x + grid / 2 + Math.cos(off) * grid * 0.4, y + grid / 2 + Math.sin(off) * grid * 0.4, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      break;
    }

    case 'wood': {
      // Planks run along the texture's v axis (toward the wall) at 90°.
      const plank = (surface.variant === 'narrow' ? 16 : surface.variant === 'wide' ? 40 : 26) * u;
      const grainAlpha = surface.variant === 'bold' ? 0.38 : surface.variant === 'soft' ? 0.14 : 0.24;
      const seam = Math.max(1, (surface.variant === 'bold' ? 2.4 : surface.variant === 'soft' ? 1 : 1.6) * u);
      const turn = (((angle || 90) % 180) + 180) % 180;
      const across = turn < 45 || turn > 135;
      ctx.save();
      if (across) {
        // Planks run left–right
        ctx.translate(w, 0);
        ctx.rotate(Math.PI / 2);
      }
      const W = across ? h : w;
      const H = across ? w : h;
      for (let x = 0, i = 0; x < W; x += plank, i++) {
        const len = plank * (5 + rand() * 4);
        let y = -rand() * len;
        while (y < H) {
          const tone = 0.88 + rand() * 0.22;
          ctx.fillStyle = rgb(shade(a, tone));
          ctx.fillRect(x, y, plank, len);
          // Grain: wavy streaks along the board
          ctx.strokeStyle = rgb(b, grainAlpha);
          ctx.lineWidth = Math.max(0.6, 0.8 * u);
          const lines = 4 + Math.floor(rand() * 4);
          for (let g = 0; g < lines; g++) {
            const gx = x + (0.12 + rand() * 0.76) * plank;
            const amp = (0.6 + rand() * 1.8) * u;
            const freq = 0.01 + rand() * 0.02;
            const phase = rand() * 10;
            ctx.beginPath();
            for (let s = 0; s <= len; s += 6 * u) {
              const px = gx + Math.sin(s * freq / u + phase) * amp;
              if (s === 0) ctx.moveTo(px, y + s);
              else ctx.lineTo(px, y + s);
            }
            ctx.stroke();
          }
          // Knot, occasionally
          if (rand() > 0.82) {
            ctx.fillStyle = rgb(b, grainAlpha * 1.6);
            ctx.beginPath();
            ctx.ellipse(x + (0.3 + rand() * 0.4) * plank, y + rand() * len, 2.2 * u, 3.6 * u, 0, 0, Math.PI * 2);
            ctx.fill();
          }
          // Board end seam
          ctx.fillStyle = rgb(shade(b, 0.75), 0.9);
          ctx.fillRect(x, y, plank, seam);
          y += len;
        }
        // Long seam between planks
        ctx.fillStyle = rgb(shade(b, 0.7), 0.95);
        ctx.fillRect(x, 0, seam, H);
      }
      ctx.restore();
      break;
    }

    case 'tile': {
      const size = 44 * u;
      const grout = Math.max(1, 2 * u);
      const diagonal = [45, 135, 225, 315].some((d) => Math.abs((((angle % 360) + 360) % 360) - d) <= 10);
      ctx.save();
      if (diagonal) {
        ctx.translate(w / 2, h / 2);
        ctx.rotate(Math.PI / 4);
        ctx.translate(-w, -h);
      }
      const span = diagonal ? Math.hypot(w, h) * 1.5 : 0;
      const W = diagonal ? w * 2 + span : w;
      const H = diagonal ? h * 2 + span : h;
      ctx.fillStyle = rgb(shade(b, 0.92));
      ctx.fillRect(0, 0, W, H);
      for (let y = 0; y < H; y += size) {
        for (let x = 0; x < W; x += size) {
          const tone = 0.96 + rand() * 0.07;
          const g = ctx.createLinearGradient(x, y, x + size, y + size);
          g.addColorStop(0, rgb(shade(a, tone * 1.03)));
          g.addColorStop(1, rgb(shade(a, tone * 0.97)));
          ctx.fillStyle = g;
          ctx.fillRect(x + grout / 2, y + grout / 2, size - grout, size - grout);
          // Glaze highlight
          ctx.fillStyle = 'rgba(255,255,255,0.12)';
          ctx.fillRect(x + grout, y + grout, size - grout * 2, (size - grout * 2) * 0.18);
        }
      }
      ctx.restore();
      break;
    }

    default:
      break;
  }

  drawFibre(ctx, w, h, u, seed);
  return canvas;
}

// ─── Paper bump ───────────────────────────────────────────────────────────────

let bumpCache: HTMLCanvasElement | null = null;

/** Tileable 256px crumple map: soft blotches plus fine fibre. Cached. */
export function paperBump(): HTMLCanvasElement {
  if (bumpCache) return bumpCache;
  const size = 256;
  const canvas = makeCanvas(size, size);
  const ctx = context(canvas);
  const rand = rng(42);
  ctx.fillStyle = 'rgb(128,128,128)';
  ctx.fillRect(0, 0, size, size);
  // Soft crumple blotches, wrapped at the edges so the map tiles
  for (let i = 0; i < 90; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const r = 8 + rand() * 40;
    const v = rand() > 0.5 ? 255 : 0;
    for (const ox of [-size, 0, size]) {
      for (const oy of [-size, 0, size]) {
        const g = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
        g.addColorStop(0, `rgba(${v},${v},${v},0.09)`);
        g.addColorStop(1, `rgba(${v},${v},${v},0)`);
        ctx.fillStyle = g;
        ctx.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
      }
    }
  }
  // Fine grain
  const img = ctx.getImageData(0, 0, size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (rand() - 0.5) * 26;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
  bumpCache = canvas;
  return canvas;
}
