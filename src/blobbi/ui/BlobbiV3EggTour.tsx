/**
 * The hatching tour's effects around a V3 egg.
 *
 * The egg itself is the kit's drawing (BlobbiV3Visual, with the kit's own
 * `eggCrack` overlay); nothing here draws an egg. What the V1 egg (EggGraphic)
 * does AROUND its shell for a tour state is done here around the kit's: the
 * pulsing glow behind it, the auto-wiggle while it waits for a tap, the shake
 * while it cracks, the shell opening, and its absence once hatched. The same
 * classes and CSS (egg-animations.css), so the same reduced-motion rule.
 */

import { useCallback, useEffect, useState, type ReactNode } from 'react';

import { impactLight } from '@/lib/haptics';
import { cn } from '@/lib/utils';
import type { EggTourVisualState } from '@/blobbi/egg';
import '@/blobbi/egg/styles/egg-animations.css';

/** The tour states in which a tap on the egg is the tour's next step. */
const TAPPABLE: ReadonlySet<EggTourVisualState> = new Set(['glowing_waiting_click', 'crack_stage_1', 'crack_stage_2', 'crack_stage_3']);
const CRACKING: ReadonlySet<EggTourVisualState> = new Set(['crack_stage_1', 'crack_stage_2', 'crack_stage_3']);

export interface BlobbiV3EggTourProps {
  /** Tour visual state, driven by the tour orchestration (the hatching ceremony). */
  tourVisualState?: EggTourVisualState;
  /** Called when the egg is tapped during an interactive tour step. */
  onTourEggClick?: () => void;
  /** The egg's own colour, for the glow behind it. */
  glowColor: string;
  /** Ambient glow pulse when nothing else is going on (as `animated` on the V1 egg). */
  animated?: boolean;
  /** The kit's egg. */
  children: ReactNode;
}

export function BlobbiV3EggTour({ tourVisualState = 'idle', onTourEggClick, glowColor, animated = false, children }: BlobbiV3EggTourProps) {
  const [wiggling, setWiggling] = useState(false);

  // Waiting for a tap: an immediate wiggle, then one every 2.5s, as the V1 egg does.
  const autoWiggle = tourVisualState === 'show_hatch_card' || tourVisualState === 'glowing_waiting_click';
  useEffect(() => {
    if (!autoWiggle) return;
    setWiggling(true);
    const timer = setInterval(() => setWiggling(true), 2500);
    return () => {
      clearInterval(timer);
      // A wiggle the shake or the opening cut short must not resume afterwards.
      setWiggling(false);
    };
  }, [autoWiggle]);

  const tappable = !!onTourEggClick && TAPPABLE.has(tourVisualState);
  const handleClick = useCallback(() => {
    if (!tappable) return;
    setWiggling(true);
    impactLight();
    onTourEggClick?.();
  }, [tappable, onTourEggClick]);

  const cracking = CRACKING.has(tourVisualState);
  const glowing = tourVisualState === 'glowing_waiting_click' || cracking;
  const hatchLight = tourVisualState === 'opening' || tourVisualState === 'hatching';
  // Once the shell opens there is nothing left to wiggle: a tap during the crack stages must not outlive them.
  useEffect(() => {
    if (hatchLight) setWiggling(false);
  }, [hatchLight]);

  return (
    <div className="relative flex size-full items-center justify-center" data-blobbi-v3-egg-tour={tourVisualState}>
      <div
        aria-hidden
        data-blobbi-v3-egg-glow=""
        className={cn(
          'absolute rounded-full blur-xl transition-all duration-1000',
          animated && !glowing && !hatchLight && 'animate-pulse',
          (glowing || hatchLight) && 'animate-egg-tour-glow',
        )}
        style={{
          width: hatchLight ? '200%' : glowing ? '150%' : '120%',
          height: hatchLight ? '200%' : glowing ? '150%' : '120%',
          background: hatchLight
            ? `radial-gradient(circle, #fff 0%, ${glowColor}66 40%, transparent 70%)`
            : glowing
              ? `radial-gradient(circle, ${glowColor}66 0%, ${glowColor}33 30%, transparent 70%)`
              : `radial-gradient(circle, ${glowColor}4d 0%, transparent 70%)`,
          zIndex: 0,
        }}
      />
      <div
        data-blobbi-v3-egg-shell=""
        onClick={handleClick}
        onAnimationEnd={(e) => {
          if (e.animationName === 'egg-tap-wiggle') setWiggling(false);
        }}
        className={cn(
          'relative z-10 size-full transition-all duration-500',
          tappable && 'cursor-pointer',
          // A tap wiggle, unless the shell is already shaking from a crack.
          wiggling && !cracking && 'animate-egg-tap-wiggle',
          // The crack stages shake the shell; during 'opening' the shell runs its own animation instead.
          cracking && 'animate-egg-crack',
          tourVisualState === 'opening' && 'animate-egg-tour-open',
          tourVisualState === 'hatching' && 'opacity-0',
        )}
      >
        {children}
      </div>
    </div>
  );
}
