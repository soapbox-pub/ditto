/**
 * BlobbiRevealOverlay - Full-screen celebration overlay shown after hatching.
 *
 * Features:
 * - Darkened backdrop
 * - Newly hatched Blobbi in the center with light rays + particles
 * - Naming input so the user can rename immediately
 * - Click outside or press Escape to dismiss
 *
 * This component is reusable for future reveals:
 * "Blobbi evolved", "Blobbi hatched", "special reward", etc.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { Sparkles } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { BlobbiStageVisual } from '@/blobbi/ui/BlobbiStageVisual';
import { cn } from '@/lib/utils';

import type { BlobbiCompanion } from '@/blobbi/core/lib/blobbi';

// ─── Particle Layout ──────────────────────────────────────────────────────────

/**
 * Pre-computed particle positions for the reveal effect.
 *
 * Particles are placed in polar coordinates (angle + radius from center)
 * and converted to percentage offsets within a 500px field. This produces
 * a radial distribution that complements the ray/glow composition instead
 * of a uniform square scatter.
 *
 * Layout strategy:
 * - 3 concentric rings at different radii (inner, mid, outer)
 * - Particles staggered across rings so they don't align with the 8 rays
 * - Varied sizes and animation timing per ring for depth
 * - Deterministic: no Math.random() in render, stable across re-renders
 */
interface ParticleDef {
  /** X offset as percentage of the 500px field (0–100) */
  x: number;
  /** Y offset as percentage of the 500px field (0–100) */
  y: number;
  /** Particle diameter in px */
  size: number;
  /** Animation delay in seconds */
  delay: number;
  /** Animation duration in seconds */
  duration: number;
  /** Opacity 0–1 */
  opacity: number;
}

/**
 * Convert polar coordinates (angle in degrees, radius as 0–50 percent of field)
 * to x/y percentages within a square field centered at 50%/50%.
 */
function polar(angleDeg: number, radiusPct: number): { x: number; y: number } {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: 50 + radiusPct * Math.cos(rad),
    y: 50 + radiusPct * Math.sin(rad),
  };
}

/**
 * The 8 rays are at 0°, 45°, 90°, … 315°. Particles are offset from
 * those angles so they sit *between* rays, not on top of them.
 */
const REVEAL_PARTICLES: ParticleDef[] = (() => {
  const particles: ParticleDef[] = [];

  // Inner ring — 4 particles, small, fast, bright
  // Angles offset ~22° from rays so they sit in the gaps
  for (let i = 0; i < 4; i++) {
    const angle = 22 + i * 90; // 22°, 112°, 202°, 292°
    const { x, y } = polar(angle, 18);
    particles.push({ x, y, size: 3, delay: i * 0.4, duration: 2.2, opacity: 0.7 });
  }

  // Mid ring — 5 particles, medium, moderate speed
  // Staggered at ~36° increments starting at 10°
  for (let i = 0; i < 5; i++) {
    const angle = 10 + i * 72; // 10°, 82°, 154°, 226°, 298°
    const { x, y } = polar(angle, 30);
    particles.push({ x, y, size: 4, delay: 0.2 + i * 0.35, duration: 2.8, opacity: 0.55 });
  }

  // Outer ring — 6 particles, larger, slower, subtler
  // Distributed at 60° increments starting at 35°
  for (let i = 0; i < 6; i++) {
    const angle = 35 + i * 60; // 35°, 95°, 155°, 215°, 275°, 335°
    const { x, y } = polar(angle, 42);
    particles.push({ x, y, size: 5, delay: 0.1 + i * 0.3, duration: 3.4, opacity: 0.4 });
  }

  return particles;
})();

// ─── Types ────────────────────────────────────────────────────────────────────

interface BlobbiRevealOverlayProps {
  /** The companion to reveal (should be in baby stage after hatching) */
  companion: BlobbiCompanion;
  /** Whether the overlay is visible */
  open: boolean;
  /** Called when the overlay is dismissed (click outside or confirm) */
  onDismiss: () => void;
  /** Called when user confirms a name */
  onNameConfirm: (name: string) => Promise<void>;
  /** Whether the name update is in progress */
  isNaming?: boolean;
  /** Whether to respect reduced-motion preferences */
  reducedMotion?: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function BlobbiRevealOverlay({
  companion,
  open,
  onDismiss,
  onNameConfirm,
  isNaming = false,
  reducedMotion = false,
}: BlobbiRevealOverlayProps) {
  const [name, setName] = useState(companion.name === 'Egg' ? '' : companion.name);
  const [isVisible, setIsVisible] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Animate in
  useEffect(() => {
    if (open) {
      // Small delay for the animation to feel intentional
      const timer = setTimeout(() => setIsVisible(true), 50);
      return () => clearTimeout(timer);
    } else {
      setIsVisible(false);
    }
  }, [open]);

  // Focus the input when overlay opens
  useEffect(() => {
    if (isVisible) {
      const timer = setTimeout(() => inputRef.current?.focus(), 400);
      return () => clearTimeout(timer);
    }
  }, [isVisible]);

  // Handle backdrop click
  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (contentRef.current && !contentRef.current.contains(e.target as Node)) {
      onDismiss();
    }
  }, [onDismiss]);

  // Handle escape key
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onDismiss]);

  const handleConfirm = async () => {
    const trimmed = name.trim();
    if (trimmed.length > 0) {
      await onNameConfirm(trimmed);
    } else {
      // If empty, just dismiss without renaming
      onDismiss();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isNaming) {
      e.preventDefault();
      handleConfirm();
    }
  };

  if (!open) return null;

  return (
    <div
      className={cn(
        'fixed inset-0 z-50 flex items-center justify-center',
        'transition-opacity duration-500',
        isVisible ? 'opacity-100' : 'opacity-0',
      )}
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-label="Your Blobbi has hatched!"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      {/* Center content */}
      <div
        ref={contentRef}
        className={cn(
          'relative flex flex-col items-center gap-6 z-10 px-6 max-w-sm w-full',
          'transition-all duration-700 ease-out',
          isVisible ? 'translate-y-0 scale-100' : 'translate-y-8 scale-95',
        )}
      >
        {/* Celebration header */}
        <div className={cn(
          'flex items-center gap-2 text-amber-300',
          'transition-opacity duration-500 delay-300',
          isVisible ? 'opacity-100' : 'opacity-0',
        )}>
          <Sparkles className="size-5" />
          <span className="text-lg font-semibold tracking-wide uppercase">
            Hatched!
          </span>
          <Sparkles className="size-5" />
        </div>

        {/* Blobbi visual — rays/glow are positioned relative to this container
            so the composition is always centered on the Blobbi itself */}
        <div className={cn(
          'relative flex items-center justify-center',
          'transition-all duration-700 delay-200',
          isVisible ? 'translate-y-0 scale-100' : 'translate-y-4 scale-90',
        )}>
          {/* Light rays + glow + particles (centered on the Blobbi) */}
          {!reducedMotion && (
            <>
              {/* Radial glow — anchored to Blobbi center */}
              <div
                className={cn(
                  'absolute size-[500px] rounded-full pointer-events-none',
                  'transition-transform duration-1000 ease-out',
                  isVisible ? 'scale-100' : 'scale-50',
                )}
                style={{
                  background: 'radial-gradient(circle, rgba(251,191,36,0.3) 0%, rgba(251,191,36,0.1) 35%, transparent 70%)',
                }}
              />

              {/* Rotating rays — anchored to Blobbi center */}
              <div
                className={cn(
                  'absolute size-[600px] pointer-events-none',
                  isVisible ? 'animate-spin-slow' : '',
                )}
                style={{ animationDuration: '20s' }}
              >
                {[...Array(8)].map((_, i) => (
                  <div
                    key={i}
                    className="absolute top-1/2 left-1/2 h-[300px] w-[2px] -translate-x-1/2 origin-top"
                    style={{
                      transform: `translateX(-50%) rotate(${i * 45}deg)`,
                      background: 'linear-gradient(to bottom, rgba(251,191,36,0.4), transparent)',
                    }}
                  />
                ))}
              </div>

              {/* Floating particles — radially distributed across a 500px field */}
              <div className="absolute size-[500px] pointer-events-none">
                {REVEAL_PARTICLES.map((p, i) => (
                  <div
                    key={i}
                    className="absolute rounded-full bg-amber-300 animate-float-particle"
                    style={{
                      left: `${p.x}%`,
                      top: `${p.y}%`,
                      width: p.size,
                      height: p.size,
                      opacity: p.opacity,
                      animationDelay: `${p.delay}s`,
                      animationDuration: `${p.duration}s`,
                    }}
                  />
                ))}
              </div>
            </>
          )}

          {/* The actual Blobbi */}
          <BlobbiStageVisual
            companion={companion}
            size="lg"
            animated
            className="relative z-10 size-48 sm:size-56 drop-shadow-[0_0_30px_rgba(251,191,36,0.3)]"
          />
        </div>

        {/* Naming section */}
        <div className={cn(
          'w-full space-y-4 transition-all duration-500 delay-500',
          isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4',
        )}>
          <div className="text-center">
            <p className="text-white/80 text-sm">
              Give your new Blobbi a name
            </p>
          </div>

          <Input
            ref={inputRef}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Enter a name..."
            maxLength={32}
            disabled={isNaming}
            className="text-center font-medium text-lg bg-white/10 border-white/20 text-white placeholder:text-white/40 focus:border-amber-400/50 focus:ring-amber-400/20"
          />

          <div className="flex gap-3">
            <Button
              variant="ghost"
              className="flex-1 text-white/60 hover:text-white hover:bg-white/10"
              onClick={onDismiss}
              disabled={isNaming}
            >
              Skip
            </Button>
            <Button
              className="flex-1 bg-amber-500 hover:bg-amber-600 text-white shadow-lg shadow-amber-500/20"
              onClick={handleConfirm}
              disabled={isNaming || name.trim().length === 0}
            >
              {isNaming ? 'Saving...' : 'Confirm'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
