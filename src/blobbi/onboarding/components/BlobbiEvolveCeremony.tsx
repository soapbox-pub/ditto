/**
 * BlobbiEvolveCeremony - Immersive evolution experience (baby -> adult)
 *
 * Flow:
 *   1. Full-screen dark backdrop with baby blobbi centered, pulsing glow + spiraling particles
 *   2. Screen flash — evolution mutation fires
 *   3. Flash clears — adult blobbi revealed with sparkles + radiant glow
 *   4. Brief dialog, then fade to white and complete
 */

import { useState, useEffect, useMemo, useRef } from 'react';
import type { NostrEvent } from '@nostrify/nostrify';

import { notificationSuccess } from '@/lib/haptics';
import { cn } from '@/lib/utils';

import { BlobbiStageVisual } from '@/blobbi/ui/BlobbiStageVisual';
import type { BlobbiCompanion } from '@/blobbi/core/lib/blobbi';

// ─── Phase Machine ────────────────────────────────────────────────────────────

type EvolvePhase =
  | 'gather'     // baby visible, energy gathering with spiraling particles
  | 'flash'      // screen flash, mutation fires
  | 'reveal'     // flash clears, adult revealed with sparkles
  | 'dialog'     // congratulatory text
  | 'complete';  // fade out

// ─── Props ────────────────────────────────────────────────────────────────────

interface BlobbiEvolveCeremonyProps {
  companion: BlobbiCompanion;
  /** Fires the actual evolve mutation (baby -> adult). */
  onEvolve: () => Promise<void>;
  /** Called when the animation is complete and the overlay should close. */
  onComplete: () => void;
  /** Optimistically update the companion event in cache. */
  updateCompanionEvent: (event: NostrEvent) => void;
}

// ─── Color Helpers ────────────────────────────────────────────────────────────

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.substring(0, 2), 16),
    g: parseInt(h.substring(2, 4), 16),
    b: parseInt(h.substring(4, 6), 16),
  };
}

function blendToWhite(channel: number, amount: number): number {
  return Math.round(channel + (255 - channel) * amount);
}

// ─── Component ────────────────────────────────────────────────────────────────

export function BlobbiEvolveCeremony({
  companion,
  onEvolve,
  onComplete,
}: BlobbiEvolveCeremonyProps) {
  const [phase, setPhase] = useState<EvolvePhase>('gather');
  const [showFlash, setShowFlash] = useState(false);
  const [adultVisible, setAdultVisible] = useState(false);
  const [fadeOut, setFadeOut] = useState(false);
  const evolveTriggered = useRef(false);

  const baseColor = companion.visualTraits.baseColor ?? '#8b5cf6';
  const { r, g, b } = useMemo(() => hexToRgb(baseColor), [baseColor]);

  // Build adult companion for visual preview (same visual traits, stage=adult)
  const adultCompanion = useMemo((): BlobbiCompanion => ({
    ...companion,
    stage: 'adult',
    state: 'active' as const,
    progressionState: 'none' as const,
  }), [companion]);

  // Background: baby's base color blended toward white for a soft pastel
  const revealBg = useMemo(() => {
    const s0 = `rgb(${blendToWhite(r, 0.65)},${blendToWhite(g, 0.65)},${blendToWhite(b, 0.65)})`;
    const s1 = `rgb(${blendToWhite(r, 0.68)},${blendToWhite(g, 0.68)},${blendToWhite(b, 0.68)})`;
    const s2 = `rgb(${blendToWhite(r, 0.72)},${blendToWhite(g, 0.72)},${blendToWhite(b, 0.72)})`;
    const s3 = `rgb(${blendToWhite(r, 0.76)},${blendToWhite(g, 0.76)},${blendToWhite(b, 0.76)})`;
    const s4 = `rgb(${blendToWhite(r, 0.80)},${blendToWhite(g, 0.80)},${blendToWhite(b, 0.80)})`;
    return `radial-gradient(ellipse at 50% 45%, ${s0} 0%, ${s1} 25%, ${s2} 50%, ${s3} 75%, ${s4} 100%)`;
  }, [r, g, b]);

  // Dark background for gather phase
  const darkBg = useMemo(() => {
    const dr = Math.round(r * 0.12);
    const dg = Math.round(g * 0.12);
    const db = Math.round(b * 0.12);
    return `radial-gradient(ellipse at center, rgb(${dr + 10},${dg + 15},${db + 25}) 0%, rgb(${dr + 5},${dg + 10},${db + 18}) 50%, rgb(${dr},${dg + 5},${db + 12}) 100%)`;
  }, [r, g, b]);

  // ── Phase timeline ──
  useEffect(() => {
    // gather -> flash after 2.8s
    const t1 = setTimeout(() => {
      setPhase('flash');
      setShowFlash(true);
      notificationSuccess();
    }, 2800);
    // flash -> reveal after 3.2s total (near-instant swap)
    const t2 = setTimeout(() => {
      setShowFlash(false);
      setPhase('reveal');
      setAdultVisible(true);
    }, 3200);
    // reveal -> dialog after 5s total
    const t3 = setTimeout(() => setPhase('dialog'), 5000);
    // dialog -> fadeout after 8s total
    const t4 = setTimeout(() => {
      setFadeOut(true);
      setTimeout(() => {
        setPhase('complete');
        onComplete();
      }, 2000);
    }, 8000);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
    };
  }, [onComplete]);

  // ── Fire evolve mutation during flash ──
  useEffect(() => {
    if (phase === 'flash' && !evolveTriggered.current) {
      evolveTriggered.current = true;
      onEvolve().catch(console.error);
    }
  }, [phase, onEvolve]);

  const showBaby = phase === 'gather';
  const showAdult = phase === 'reveal' || phase === 'dialog';

  return (
    <div
      className="fixed inset-0 z-50 overflow-hidden select-none"
      style={{
        background: showAdult ? revealBg : darkBg,
        transition: 'background 0.15s ease-out',
      }}
    >
      {/* ── Vignette shadow for depth ── */}
      {showAdult && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'radial-gradient(ellipse at 50% 45%, transparent 30%, rgba(0,0,0,0.12) 70%, rgba(0,0,0,0.25) 100%)',
          }}
        />
      )}

      {/* ── Ambient color glow (gather phase) ── */}
      {showBaby && (
        <div
          className="absolute inset-0"
          style={{
            background: `radial-gradient(ellipse at 50% 50%, rgba(${r},${g},${b},0.25) 0%, transparent 60%)`,
            opacity: 0.15,
          }}
        />
      )}

      {/* ── Spiraling energy particles (gather phase) ── */}
      {showBaby && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          {Array.from({ length: 12 }).map((_, i) => {
            const angle = (i / 12) * 360;
            const delay = i * 0.25;
            return (
              <div
                key={`particle-${i}`}
                className="absolute left-1/2 top-1/2"
                style={{
                  width: 4 + (i % 3) * 2,
                  height: 4 + (i % 3) * 2,
                  borderRadius: '50%',
                  background: i % 2 === 0
                    ? `radial-gradient(circle, rgba(${r},${g},${b},0.9) 0%, transparent 70%)`
                    : `radial-gradient(circle, rgba(255,255,255,0.9) 0%, transparent 70%)`,
                  animation: `evolve-spiral-in 3s ease-in ${delay}s infinite`,
                  transform: `rotate(${angle}deg) translateX(200px)`,
                }}
              />
            );
          })}
        </div>
      )}

      {/* ── Baby blobbi (gather phase) ── */}
      {showBaby && (
        <div className="absolute inset-0 flex items-center justify-center" style={{ paddingBottom: '10%' }}>
          {/* Pulsing glow behind baby */}
          <div
            className="absolute rounded-full"
            style={{
              width: 250,
              height: 250,
              background: `radial-gradient(circle, rgba(${r},${g},${b},0.2) 0%, transparent 70%)`,
              filter: 'blur(20px)',
              animation: 'evolve-glow-pulse 2s ease-in-out infinite',
            }}
          />

          <div className="relative">
            <BlobbiStageVisual
              companion={companion}
              size="lg"
              animated
              className="size-56 sm:size-64 md:size-72"
            />
          </div>
        </div>
      )}

      {/* ── Screen flash ── */}
      {showFlash && (
        <div
          className="absolute inset-0 bg-white pointer-events-none"
          style={{
            zIndex: 80,
            animation: 'onboard-screen-flash 2s ease-out forwards',
          }}
        />
      )}

      {/* ── Adult blobbi revealed with sparkles ── */}
      {showAdult && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ paddingBottom: '18%' }}>
          {/* Rotating radiant glow */}
          <div
            className="absolute"
            style={{
              opacity: adultVisible ? 1 : 0,
              transform: adultVisible ? 'scale(1)' : 'scale(0.7)',
              transition: 'opacity 0.2s ease-out, transform 0.2s ease-out',
            }}
          >
            <div
              className="animate-onboard-golden-rotate"
              style={{
                width: 800,
                height: 800,
                background: `conic-gradient(
                  from 0deg,
                  rgba(${r},${g},${b},0.15) 0deg,
                  rgba(255,255,255,0.35) 50deg,
                  rgba(${r},${g},${b},0.18) 100deg,
                  rgba(255,255,255,0.12) 150deg,
                  rgba(${r},${g},${b},0.30) 210deg,
                  rgba(255,255,255,0.15) 270deg,
                  rgba(${r},${g},${b},0.12) 320deg,
                  rgba(${r},${g},${b},0.15) 360deg
                )`,
                borderRadius: '50%',
                filter: 'blur(30px)',
              }}
            />
          </div>

          {/* Bright center shine */}
          <div
            className={cn(
              'absolute rounded-full transition-opacity duration-150',
              adultVisible ? 'opacity-100' : 'opacity-0',
            )}
            style={{
              width: 320,
              height: 320,
              background: `radial-gradient(circle, rgba(255,255,245,0.60) 0%, rgba(${r},${g},${b},0.20) 40%, transparent 70%)`,
            }}
          />

          {/* Wider halo */}
          <div
            className={cn(
              'absolute rounded-full transition-opacity duration-200',
              adultVisible ? 'opacity-100' : 'opacity-0',
            )}
            style={{
              width: 650,
              height: 650,
              background: `radial-gradient(circle, rgba(${r},${g},${b},0.25) 0%, rgba(${r},${g},${b},0.10) 40%, transparent 65%)`,
              filter: 'blur(15px)',
            }}
          />

          {/* ── Sparkles ── */}
          {Array.from({ length: 18 }).map((_, i) => {
            const angle = (i / 18) * Math.PI * 2;
            const radius = 90 + (i % 4) * 40;
            const size = 4 + (i % 3) * 3;
            return (
              <div
                key={`spark-${i}`}
                className="absolute"
                style={{
                  width: size,
                  height: size,
                  left: `calc(50% + ${Math.cos(angle) * radius}px - ${size / 2}px)`,
                  top: `calc(50% + ${Math.sin(angle) * radius}px - ${size / 2}px)`,
                  borderRadius: '50%',
                  background: i % 2 === 0
                    ? `radial-gradient(circle, rgba(255,255,255,1) 0%, rgba(255,255,255,0.3) 50%, transparent 70%)`
                    : `radial-gradient(circle, rgba(${r},${g},${b},0.9) 0%, rgba(${r},${g},${b},0.2) 50%, transparent 70%)`,
                  animation: `onboard-sparkle-twinkle ${1.5 + (i % 6) * 0.5}s ease-in-out ${i * 0.15}s infinite`,
                }}
              />
            );
          })}

          {/* Outer ring sparkles */}
          {Array.from({ length: 14 }).map((_, i) => {
            const angle = (i / 14) * Math.PI * 2 + 0.4;
            const radius = 180 + (i % 3) * 45;
            const size = 5 + (i % 4) * 2;
            return (
              <div
                key={`outer-${i}`}
                className="absolute"
                style={{
                  width: size,
                  height: size,
                  left: `calc(50% + ${Math.cos(angle) * radius}px - ${size / 2}px)`,
                  top: `calc(50% + ${Math.sin(angle) * radius}px - ${size / 2}px)`,
                  borderRadius: '50%',
                  background: i % 3 === 0
                    ? 'radial-gradient(circle, rgba(255,255,255,0.9) 0%, transparent 60%)'
                    : `radial-gradient(circle, rgba(${r},${g},${b},0.7) 0%, transparent 60%)`,
                  animation: `onboard-sparkle-twinkle ${2.5 + (i % 5) * 0.7}s ease-in-out ${i * 0.2}s infinite`,
                }}
              />
            );
          })}

          {/* Rising light motes */}
          {Array.from({ length: 8 }).map((_, i) => {
            const x = (Math.sin(i * 2.3) * 0.5 + 0.5) * 70 + 15;
            return (
              <div
                key={`mote-${i}`}
                className="absolute"
                style={{
                  width: 5 + (i % 3) * 3,
                  height: 5 + (i % 3) * 3,
                  left: `${x}%`,
                  bottom: '20%',
                  borderRadius: '50%',
                  background: `radial-gradient(circle, rgba(${r},${g},${b},0.8) 0%, rgba(${r},${g},${b},0.2) 50%, transparent 100%)`,
                  animation: `onboard-sparkle-drift ${4 + i * 0.5}s ease-out ${i * 0.4}s infinite`,
                }}
              />
            );
          })}

          {/* The adult blobbi */}
          <div className={cn(
            'relative transition-opacity duration-150',
            adultVisible ? 'opacity-100' : 'opacity-0',
          )}>
            <BlobbiStageVisual
              companion={adultCompanion}
              size="lg"
              animated
              className="size-[30rem] sm:size-[36rem] md:size-[44rem]"
            />
          </div>
        </div>
      )}

      {/* ── Dialog text ── */}
      {phase === 'dialog' && (
        <div className="absolute inset-x-0 bottom-0 flex justify-center pb-28 sm:pb-36 px-8">
          <div className="relative max-w-md w-full text-center">
            {/* Soft feathered backdrop */}
            <div
              className="absolute -inset-32"
              style={{
                background: 'radial-gradient(ellipse at center, rgba(0,30,50,0.35) 0%, rgba(0,30,50,0.15) 35%, transparent 65%)',
                backdropFilter: 'blur(24px)',
                WebkitBackdropFilter: 'blur(24px)',
                mask: 'radial-gradient(ellipse at center, black 25%, transparent 65%)',
                WebkitMask: 'radial-gradient(ellipse at center, black 25%, transparent 65%)',
              }}
            />

            <div className="relative animate-onboard-soft-fade-in">
              <p className="text-base sm:text-lg text-white leading-relaxed font-light">
                {companion.name} has evolved!
              </p>
              <p className="text-sm text-white/60 mt-2 font-light">
                A new chapter begins...
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Fade to white on completion ── */}
      {fadeOut && (
        <div
          className="absolute inset-0 bg-white pointer-events-none"
          style={{
            zIndex: 90,
            animation: 'blobbi-fade-to-white 2s ease-in forwards',
          }}
        />
      )}
    </div>
  );
}
