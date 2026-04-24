/**
 * Crumble Engine — The UI crumbles around Blobbi.
 *
 * Blobbi's tantrum causes the entire interface to disintegrate while
 * Blobbi stands alone in the void. The effect layers:
 *
 *   - An opaque dark backdrop slides IN at z-9998 (below the companion
 *     at z-9999 but above all page content). This hides the UI while
 *     Blobbi remains visible — the last thing standing.
 *
 *   - A canvas at z-99998 draws debris particles: dark rubble fragments
 *     that spawn across the full viewport and rain downward with gravity,
 *     rotation, and drift. These are the ashes of the destroyed UI.
 *
 * The backdrop fades in over ~400ms. Particles spawn everywhere (not from
 * Blobbi — Blobbi isn't the one breaking, the world around it is).
 *
 * Recovery reverses: backdrop fades out, debris converges upward and
 * vanishes, revealing the UI underneath.
 *
 * Performance: ~400 canvas rects/frame (sub-1ms draw). The backdrop is
 * a single div with opacity transition (GPU-composited).
 */

// ─── Configuration ────────────────────────────────────────────────────────────

/** How long the dark backdrop takes to fade in (ms). */
const BACKDROP_FADE_IN_MS = 400;

/** How long the dark backdrop takes to fade out during recovery (ms). */
const BACKDROP_FADE_OUT_MS = 500;

/** Delay before crumble starts (ms) — lets shockwave lead. */
const CRUMBLE_DELAY_MS = 100;

// ── Debris particles ──

const PARTICLE_COUNT = 400;
const DEBRIS_GRAVITY = 900;
const DEBRIS_MAX_INITIAL_VY = 200;
const DEBRIS_DRIFT = 120;
const DEBRIS_SPIN = 6;
const DEBRIS_MIN_SIZE = 3;
const DEBRIS_MAX_SIZE = 18;
const DEBRIS_MIN_LIFE = 1.5;
const DEBRIS_MAX_LIFE = 3.0;

/** Recovery duration (s). */
const RECOVER_DURATION = 0.6;

// ─── Types ────────────────────────────────────────────────────────────────────

interface Particle {
  x: number; y: number;
  vx: number; vy: number;
  w: number; h: number;
  rotation: number;
  vr: number;
  life: number;
  maxLife: number;
  shade: number;
  // For recovery: original spawn position
  homeX: number; homeY: number;
  // Scatter snapshot (captured when recovery starts)
  scatterX: number; scatterY: number;
  scatterR: number;
}

export interface CrumbleHandle {
  recover: () => Promise<void>;
  destroy: () => void;
}

// ─── Engine ───────────────────────────────────────────────────────────────────

export function crumble(_origin: { x: number; y: number }): CrumbleHandle {
  const W = window.innerWidth;
  const H = window.innerHeight;

  // ── Dark backdrop — covers UI, sits below Blobbi (z-9998 < companion z-9999) ──
  const backdrop = document.createElement('div');
  backdrop.style.cssText = `
    position: fixed; inset: 0; z-index: 9998;
    background: hsl(0 0% 4%);
    pointer-events: none;
    opacity: 0;
    transition: opacity ${BACKDROP_FADE_IN_MS}ms ease-out;
  `;
  document.body.appendChild(backdrop);

  // ── Debris canvas — above backdrop, below vignette ──
  const canvas = document.createElement('canvas');
  const dpr = window.devicePixelRatio || 1;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.cssText = `
    position: fixed; inset: 0; z-index: 99998;
    width: ${W}px; height: ${H}px;
    pointer-events: none;
  `;
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);

  // ── Generate particles — spawn across the entire viewport ──
  const particles: Particle[] = [];
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    // Spawn at random viewport positions (the rubble of the UI)
    const spawnX = Math.random() * W;
    const spawnY = Math.random() * H;
    const size = DEBRIS_MIN_SIZE + Math.random() * (DEBRIS_MAX_SIZE - DEBRIS_MIN_SIZE);
    const life = DEBRIS_MIN_LIFE + Math.random() * (DEBRIS_MAX_LIFE - DEBRIS_MIN_LIFE);
    particles.push({
      x: spawnX,
      y: spawnY,
      // Gentle downward + slight drift — rubble falling, not exploding
      vx: (Math.random() - 0.5) * DEBRIS_DRIFT,
      vy: Math.random() * DEBRIS_MAX_INITIAL_VY,
      w: size * (0.4 + Math.random() * 0.6),
      h: size * (0.4 + Math.random() * 0.6),
      rotation: Math.random() * Math.PI * 2,
      vr: (Math.random() - 0.5) * DEBRIS_SPIN,
      life,
      maxLife: life,
      // Mix of dark grays and muted dark colors for variety
      shade: 10 + Math.floor(Math.random() * 50),
      homeX: spawnX,
      homeY: spawnY,
      scatterX: 0, scatterY: 0, scatterR: 0,
    });
  }

  // ── State ──
  let phase: 'delay' | 'crumbling' | 'holding' | 'recovering' | 'done' = 'delay';
  let elapsed = 0;
  let recoverElapsed = 0;
  let prevTime = performance.now();
  let raf: number | null = null;
  let resolveRecover: (() => void) | null = null;

  // ── Draw debris ──
  function drawDebris(dt: number, recovering: boolean, recoverProgress: number) {
    ctx.clearRect(0, 0, W, H);

    for (const p of particles) {
      if (recovering) {
        const ease = 1 - (1 - recoverProgress) ** 3;
        const x = p.scatterX + (p.homeX - p.scatterX) * ease;
        const y = p.scatterY + (p.homeY - p.scatterY) * ease;
        const r = p.scatterR * (1 - ease);
        // Fade out as they converge
        const alpha = recoverProgress < 0.75 ? 0.7 * (1 - recoverProgress / 0.75) : 0;
        if (alpha < 0.01) continue;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(x, y);
        ctx.rotate(r);
        ctx.fillStyle = `rgb(${p.shade},${p.shade},${p.shade})`;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      } else {
        if (p.life <= 0) continue;
        // Gravity pulls down
        p.vy += DEBRIS_GRAVITY * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rotation += p.vr * dt;
        p.life -= dt;
        const alpha = Math.max(0, p.life / p.maxLife) * 0.8;
        if (alpha < 0.01) continue;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.fillStyle = `rgb(${p.shade},${p.shade},${p.shade})`;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }
    }
  }

  // ── Animation loop ──
  function tick(now: number) {
    const dt = Math.min((now - prevTime) / 1000, 0.05);
    prevTime = now;

    if (phase === 'delay') {
      elapsed += dt * 1000;
      if (elapsed >= CRUMBLE_DELAY_MS) {
        elapsed = 0;
        phase = 'crumbling';
        // Trigger backdrop fade-in
        // Force reflow so the initial opacity:0 is committed before transitioning
        void backdrop.offsetHeight;
        backdrop.style.opacity = '1';
      }
      raf = requestAnimationFrame(tick);
      return;
    }

    if (phase === 'crumbling') {
      elapsed += dt;
      drawDebris(dt, false, 0);
      // Transition to holding once backdrop is fully visible
      if (elapsed * 1000 >= BACKDROP_FADE_IN_MS + 100) {
        phase = 'holding';
      }
      raf = requestAnimationFrame(tick);
      return;
    }

    if (phase === 'holding') {
      drawDebris(dt, false, 0);
      raf = requestAnimationFrame(tick);
      return;
    }

    if (phase === 'recovering') {
      recoverElapsed += dt;
      const progress = Math.min(1, recoverElapsed / RECOVER_DURATION);
      drawDebris(dt, true, progress);

      if (progress >= 1) {
        phase = 'done';
        ctx.clearRect(0, 0, W, H);
        resolveRecover?.();
        return;
      }
      raf = requestAnimationFrame(tick);
      return;
    }
  }

  // ── Start ──
  raf = requestAnimationFrame(tick);

  return {
    recover() {
      return new Promise<void>((resolve) => {
        resolveRecover = resolve;
        // Snapshot particle positions for interpolation
        for (const p of particles) {
          p.scatterX = p.x;
          p.scatterY = p.y;
          p.scatterR = p.rotation;
        }
        recoverElapsed = 0;
        phase = 'recovering';
        prevTime = performance.now();
        // Fade backdrop out
        backdrop.style.transition = `opacity ${BACKDROP_FADE_OUT_MS}ms ease-in`;
        backdrop.style.opacity = '0';
        if (!raf) raf = requestAnimationFrame(tick);
      });
    },
    destroy() {
      if (raf) cancelAnimationFrame(raf);
      raf = null;
      canvas.remove();
      backdrop.remove();
    },
  };
}
