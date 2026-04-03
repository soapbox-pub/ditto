import React, { useState, useCallback, useEffect, useRef } from 'react';
import type { EggVisualBlobbi } from '../types/egg.types';
import { isValidBaseColor, isValidSecondaryColor } from '../lib/blobbi-egg-validation';
import { SpecialMarkRenderer, SpecialMarkFallback } from './SpecialMarkRenderer';
import { isSpecialMarkSupported } from '../lib/special-marks-utils';
import { useSpecialMark } from '../hooks/useSpecialMark';
import { isDivineEgg } from '../lib/blobbi-divine-utils';
import { cn } from '../lib/cn';

/**
 * Reaction states that trigger different animations
 */
export type EggReactionState = 'idle' | 'listening' | 'swaying' | 'singing' | 'happy';

/**
 * Status effects for egg-stage visual feedback.
 * These are simpler than adult/baby expressions since eggs don't have faces.
 */
export interface EggStatusEffects {
  /** Dirty state: shows sweat droplet and dust underneath */
  dirty?: boolean;
  /** Health state: shows floating dizzy spirals around egg */
  sick?: boolean;
  /** Happy state: shows subtle sparkles around egg */
  happy?: boolean;
}

/**
 * Tour visual states that the egg can display.
 * Driven by the tour orchestration layer, not by EggGraphic itself.
 *
 * - idle: no tour effects
 * - glowing_waiting_click: enhanced glow + auto-wiggle, waiting for tap
 * - crack_stage_1: crack expands (click 1)
 * - crack_stage_2: crack expands more (click 2)
 * - crack_stage_3: final crack (click 3)
 * - opening: shell splits open
 * - hatching: bright light + reveal
 */
export type EggTourVisualState =
  | 'idle'
  | 'glowing_waiting_click'
  | 'crack_stage_1'
  | 'crack_stage_2'
  | 'crack_stage_3'
  | 'opening'
  | 'hatching';

interface EggGraphicProps {
  blobbi?: EggVisualBlobbi; // Visual blobbi object for visual properties
  sizeVariant?: 'tiny' | 'small' | 'medium' | 'large'; // Internal scaling only, NOT layout size
  className?: string;
  animated?: boolean; // Enable ambient effects (glow pulse, particles) but NOT sway
  reaction?: EggReactionState; // Reaction state for music/sing animations
  cracking?: boolean;
  warmth?: number; // 0-100, affects the glow (fallback if no blobbi)
  forceInlineSvg?: boolean; // New prop to guarantee inline SVG
  /** Status effects for egg-stage visual feedback */
  statusEffects?: EggStatusEffects;
  /** Tour visual state - driven externally by the tour orchestration layer */
  tourVisualState?: EggTourVisualState;
  /** Callback when the egg is clicked during an interactive tour step */
  onTourEggClick?: () => void;
}

/**
 * Create a spiral path for sick/dizzy effects.
 * Generates a true Archimedean spiral that starts from center and winds outward.
 * Based on the spiral algorithm from eyes/effects.ts.
 * 
 * @param cx - Center X coordinate
 * @param cy - Center Y coordinate  
 * @param radius - Outer radius of the spiral
 * @param clockwise - If true, winds clockwise; if false, winds counter-clockwise (default: true)
 */
function createEggSpiralPath(cx: number, cy: number, radius: number, clockwise: boolean = true): string {
  const points: string[] = [];
  const turns = 2; // Number of complete rotations
  const steps = 40; // Smoothness of the spiral
  
  // Direction multiplier: 1 for clockwise, -1 for counter-clockwise
  const direction = clockwise ? 1 : -1;

  for (let i = 0; i <= steps; i++) {
    const angle = direction * (i / steps) * turns * 2 * Math.PI;
    const r = (i / steps) * radius;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);

    if (i === 0) {
      points.push(`M ${x.toFixed(2)} ${y.toFixed(2)}`);
    } else {
      points.push(`L ${x.toFixed(2)} ${y.toFixed(2)}`);
    }
  }

  return points.join(' ');
}

// Legacy fallback function for special marks (kept for compatibility)
const renderLegacySpecialMark = (specialMark: string) => {
  console.warn(
    `Using legacy special mark rendering for: ${specialMark}. Consider updating to use SpecialMarkRenderer.`
  );

  const markStyle = {
    position: 'absolute' as const,
    pointerEvents: 'none' as const,
  };

  switch (specialMark) {
    case 'dot_center':
      return (
        <div
          style={{
            ...markStyle,
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '8px',
            height: '8px',
            background: 'rgba(0, 0, 0, 0.3)',
            borderRadius: '50%',
          }}
        />
      );
    default:
      return null;
  }
};

export const EggGraphic: React.FC<EggGraphicProps> = ({
  blobbi,
  sizeVariant = 'medium',
  className,
  animated = false,
  reaction = 'idle',
  cracking = false,
  warmth = 50,
  forceInlineSvg: _forceInlineSvg = false,
  statusEffects,
  tourVisualState = 'idle',
  onTourEggClick,
}) => {
  // sizeVariant controls ONLY internal scaling/details, NOT layout dimensions
  // Parent container controls actual rendered width/height via slot

  // Build a quick map from blobbi.tags (["k","v"]) for easier lookups
  const tagMap = React.useMemo(() => {
    const map = new Map<string, string>();
    blobbi?.tags?.forEach(([k, v]) => {
      if (typeof k === 'string' && typeof v === 'string') {
        map.set(k, v);
      }
    });
    return map;
  }, [blobbi?.tags]);

  // Initialize special mark hook for dynamic rendering
  const specialMarkHook = useSpecialMark(blobbi?.specialMark || null, {
    animated,
    autoAnimate: true,
    performanceMode: false, // Can be made configurable
  });

  // Internal fill scale based on sizeVariant
  // Controls how much of the parent slot the egg fills
  // Parent container controls actual width/height
  const fillScale = {
    tiny: 0.9, // 90% fill for compact slots
    small: 0.94, // 94% fill
    medium: 0.97, // 97% fill (baseline)
    large: 1.0, // 100% fill for maximum presence
  };

  const scale = fillScale[sizeVariant] || fillScale.medium;

  // Tap-to-wiggle interaction state
  const [isTapWiggling, setIsTapWiggling] = useState(false);

  const handleEggClick = useCallback(() => {
    // Tour interactive steps: forward click to tour controller
    if (onTourEggClick && (tourVisualState === 'glowing_waiting_click' || tourVisualState === 'crack_stage_1' || tourVisualState === 'crack_stage_2' || tourVisualState === 'crack_stage_3')) {
      setIsTapWiggling(true);
      onTourEggClick();
      return;
    }
    if (isTapWiggling || cracking) return; // Don't re-trigger during animation or cracking
    setIsTapWiggling(true);
  }, [isTapWiggling, cracking, onTourEggClick, tourVisualState]);

  const handleWiggleEnd = useCallback(() => {
    setIsTapWiggling(false);
  }, []);

  // Tour: auto-wiggle effect for glowing_waiting_click state
  const shouldAutoWiggle = tourVisualState === 'glowing_waiting_click';
  const autoWiggleTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (!shouldAutoWiggle) {
      if (autoWiggleTimerRef.current) {
        clearInterval(autoWiggleTimerRef.current);
        autoWiggleTimerRef.current = null;
      }
      return;
    }
    // Trigger an immediate wiggle, then repeat every 2.5s
    setIsTapWiggling(true);
    autoWiggleTimerRef.current = setInterval(() => {
      setIsTapWiggling((prev) => {
        if (!prev) return true;
        return prev;
      });
    }, 2500);
    return () => {
      if (autoWiggleTimerRef.current) {
        clearInterval(autoWiggleTimerRef.current);
        autoWiggleTimerRef.current = null;
      }
    };
  }, [shouldAutoWiggle]);

  // Tour: whether the egg should show crack overlay
  // The crack stays visible during 'opening' so the shell fades out WITH its cracks intact.
  // Only 'idle' and 'hatching' (shell already gone) hide the crack.
  const tourShowCrack = tourVisualState !== 'idle' && tourVisualState !== 'hatching';

  // Tour: crack intensity level (0 = small center crack, 1-3 = progressively expanding)
  // Level 0: small central crack (glowing_waiting_click)
  // Level 1: crack expands left/right with small branches (crack_stage_1)
  // Level 2: crack expands further toward edges, more branches (crack_stage_2)
  // Level 3: crack reaches near shell edges, about to split (crack_stage_3, opening)
  const tourCrackLevel = tourVisualState === 'crack_stage_1' ? 1
    : tourVisualState === 'crack_stage_2' ? 2
    : (tourVisualState === 'crack_stage_3' || tourVisualState === 'opening') ? 3
    : 0;

  // Divine color constants
  const DIVINE_PRIMARY_GREEN = '#55C4A2';
  const _DIVINE_HIGHLIGHT_GREEN = '#7AD9B9';
  const _DIVINE_SHADOW_GREEN = '#2F8B77';

  // Helper functions to create color variations for 3D effect
  const hexToHsl = (hex: string): [number, number, number] => {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const diff = max - min;

    let h = 0;
    let s = 0;
    const l = (max + min) / 2;

    if (diff !== 0) {
      s = l > 0.5 ? diff / (2 - max - min) : diff / (max + min);

      switch (max) {
        case r:
          h = (g - b) / diff + (g < b ? 6 : 0);
          break;
        case g:
          h = (b - r) / diff + 2;
          break;
        case b:
          h = (r - g) / diff + 4;
          break;
      }
      h /= 6;
    }

    return [h * 360, s * 100, l * 100];
  };

  const hslToHex = (h: number, s: number, l: number): string => {
    h /= 360;
    s /= 100;
    l /= 100;

    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };

    let r, g, b;
    if (s === 0) {
      r = g = b = l; // achromatic
    } else {
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = hue2rgb(p, q, h + 1 / 3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1 / 3);
    }

    const toHex = (c: number) => {
      const hex = Math.round(c * 255).toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    };

    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  };

  // Create lighter and darker variants of a base color for 3D effect
  const createColorVariants = (baseColor: string) => {
    try {
      const [h, s, l] = hexToHsl(baseColor);

      // Create shadow (darker) and highlight (lighter) variants
      // Adjust lightness while keeping hue and saturation similar
      const shadowL = Math.max(l - 25, 10); // Darker by 25%, minimum 10%
      const highlightL = Math.min(l + 20, 90); // Lighter by 20%, maximum 90%

      // For very dark colors, boost saturation slightly for the highlight
      const highlightS = l < 30 ? Math.min(s + 15, 100) : s;

      return {
        shadow: hslToHex(h, s, shadowL),
        base: baseColor,
        highlight: hslToHex(h, highlightS, highlightL),
      };
    } catch {
      // Fallback to a simple brightness adjustment if HSL conversion fails
      return {
        shadow: baseColor,
        base: baseColor,
        highlight: baseColor,
      };
    }
  };

  // Check if this is a divine egg
  const isDivine = blobbi ? isDivineEgg(blobbi) : false;
  // Use warmth prop directly (eggTemperature is deprecated)
  const actualWarmth = warmth;

  // Get base color from blobbi or use warmth-based fallback
  const getBaseColor = () => {
    if (isDivine) {
      // Divine eggs always use the canonical Divine primary color
      return DIVINE_PRIMARY_GREEN;
    }

    // 1) direct field on the Blobbi model
    if (blobbi?.baseColor && isValidBaseColor(blobbi.baseColor)) {
      return blobbi.baseColor;
    }

    // 2) fallback: read from Nostr tag "base_color" if present
    const baseColorTag = tagMap.get('base_color');
    if (baseColorTag && isValidBaseColor(baseColorTag)) {
      return baseColorTag;
    }

    // 3) legacy fallback based on warmth
    if (actualWarmth < 30) return '#f2f2f2'; // Cool light tone (common)
    if (actualWarmth < 50) return '#e6e6ff'; // Light blue (common)
    if (actualWarmth < 70) return '#ffffcc'; // Warm cream (uncommon)
    if (actualWarmth < 85) return '#ccffcc'; // Light green (uncommon)
    return '#99ccfa'; // Warm blue (uncommon)
  };

  const getGlowColor = (warmth: number) => {
    if (isDivine) {
      return 'rgba(122, 217, 185, 0.5)'; // soft Divine aura
    }

    if (warmth < 30) return 'rgba(59, 130, 246, 0.3)'; // Blue glow
    if (warmth < 50) return 'rgba(147, 197, 253, 0.3)'; // Light blue glow
    if (warmth < 70) return 'rgba(251, 191, 36, 0.3)'; // Yellow glow
    if (warmth < 85) return 'rgba(245, 158, 11, 0.4)'; // Orange glow
    return 'rgba(239, 68, 68, 0.4)'; // Red glow (too hot)
  };

  const baseColor = getBaseColor();
  const secondaryColor =
    blobbi?.secondaryColor && isValidSecondaryColor(blobbi.secondaryColor) && !isDivine
      ? blobbi.secondaryColor
      : undefined;
  const glowColor = getGlowColor(actualWarmth);

  // Effective special mark - use divine_wordmark for Divine eggs
  const effectiveSpecialMark = blobbi?.specialMark || (isDivine ? 'divine_wordmark' : null);

  // Create gradient with full baseColor coverage - no white areas
  const createEggGradient = () => {
    // For Divine eggs, use DIVINE_PRIMARY_GREEN as the base color
    const effectiveBaseColor = isDivine ? DIVINE_PRIMARY_GREEN : baseColor;

    // Create color variants for 3D effect - guarantees full baseColor coverage
    const colors = createColorVariants(effectiveBaseColor);

    if (isDivine) {
      // Divine eggs: full green coverage with magical layered effect
      // Uses only Divine color variants to maintain green throughout entire surface
      return `
        radial-gradient(circle at 30% 25%, ${colors.highlight} 0%, ${colors.base} 40%, ${colors.shadow} 100%),
        radial-gradient(circle at 70% 80%, ${colors.highlight} 0%, transparent 45%),
        linear-gradient(145deg, ${colors.shadow} 0%, ${colors.base} 50%, ${colors.shadow} 100%)
      `;
    }

    // For eggs with secondary color: use it only as subtle accent, baseColor dominates
    if (secondaryColor) {
      const secondaryVariants = createColorVariants(secondaryColor);
      // Base color covers 80% of surface, secondary only as subtle highlight
      return `
        radial-gradient(circle at 35% 25%, ${colors.highlight} 0%, ${colors.base} 30%, ${colors.shadow} 70%),
        radial-gradient(circle at 65% 75%, ${secondaryVariants.highlight}40 0%, transparent 50%)
      `;
    }

    // Standard eggs: full baseColor coverage with 3D depth
    // Entire egg surface uses baseColor variants - no white anywhere
    return `radial-gradient(circle at 30% 25%, ${colors.highlight} 0%, ${colors.base} 40%, ${colors.shadow} 100%)`;
  };

  // Create pattern overlay based on blobbi.pattern
  const _createPatternOverlay = () => {
    if (!blobbi?.pattern) return null;

    const patternStyle = {
      position: 'absolute' as const,
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      borderRadius: '50% 50% 50% 50% / 60% 60% 40% 40%',
      opacity: 0.3,
      pointerEvents: 'none' as const,
    };

    switch (blobbi.pattern) {
      case 'gradient':
        return (
          <div
            style={{
              ...patternStyle,
              background: `linear-gradient(45deg, transparent 30%, ${secondaryColor || 'rgba(255,255,255,0.5)'} 70%)`,
            }}
          />
        );
      case 'stripes':
        return (
          <div
            style={{
              ...patternStyle,
              background: `repeating-linear-gradient(45deg, transparent, transparent 8px, ${secondaryColor || 'rgba(0,0,0,0.1)'} 8px, ${secondaryColor || 'rgba(0,0,0,0.1)'} 16px)`,
            }}
          />
        );
      case 'dots':
        return (
          <div
            style={{
              ...patternStyle,
              background: `radial-gradient(circle at 25% 25%, ${secondaryColor || 'rgba(0,0,0,0.1)'} 2px, transparent 2px), radial-gradient(circle at 75% 75%, ${secondaryColor || 'rgba(0,0,0,0.1)'} 2px, transparent 2px)`,
              backgroundSize: '20px 20px',
            }}
          />
        );
      case 'swirl':
        return (
          <div
            style={{
              ...patternStyle,
              background: `conic-gradient(from 0deg, transparent, ${secondaryColor || 'rgba(255,255,255,0.3)'}, transparent)`,
            }}
          />
        );
      default:
        return null;
    }
  };

  const effectiveBaseColor = isDivine ? DIVINE_PRIMARY_GREEN : baseColor;
  const { shadow, highlight } = createColorVariants(effectiveBaseColor);

  return (
    <div
      className={cn(
        // Always fill parent container (slot-driven sizing)
        'w-full h-full',
        // Center content
        'relative flex items-center justify-center',
        className
      )}
      style={{
        // Fallback for environments without Tailwind
        width: '100%',
        height: '100%',
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* Inner container with sizeVariant-based fill scaling */}
      <div
        className="relative flex items-center justify-center"
        style={{
          width: '100%',
          height: '100%',
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transform: `scale(${scale})`,
        }}
      >
        {/* Glow effect based on warmth - relative sizing */}
        {(() => {
          const isGlowingTour = tourVisualState === 'glowing_waiting_click'
            || tourVisualState === 'crack_stage_1' || tourVisualState === 'crack_stage_2'
            || tourVisualState === 'crack_stage_3';
          const isHatchLight = tourVisualState === 'opening' || tourVisualState === 'hatching';
          return (
            <div
              className={cn(
                'absolute rounded-full blur-xl transition-all duration-1000',
                animated && !isGlowingTour && !isHatchLight && 'animate-pulse',
                isGlowingTour && 'animate-egg-tour-glow',
                isHatchLight && 'animate-egg-tour-glow',
              )}
              style={{
                width: isHatchLight ? '200%' : isGlowingTour ? '150%' : '120%',
                height: isHatchLight ? '200%' : isGlowingTour ? '150%' : '120%',
                background: isHatchLight
                  ? `radial-gradient(circle, #fff 0%, ${glowColor} 40%, transparent 70%)`
                  : isGlowingTour
                    ? `radial-gradient(circle, ${glowColor} 0%, ${glowColor}80 30%, transparent 70%)`
                    : `radial-gradient(circle, ${glowColor} 0%, transparent 70%)`,
                zIndex: 0,
              }}
            />
          );
        })()}

        {/* Main egg shape - uses percentage-based sizing */}
        <div
          onClick={handleEggClick}
          onAnimationEnd={(e) => {
            if (e.animationName === 'egg-tap-wiggle') handleWiggleEnd();
          }}
          className={cn(
            'relative transition-all duration-500 z-10 cursor-pointer',
            // Tap wiggle (highest priority after cracking)
            isTapWiggling && !cracking && 'animate-egg-tap-wiggle',
            // Reaction-based animations (music/sing) - only when not tap-wiggling
            !isTapWiggling && (reaction === 'listening' || reaction === 'swaying' || reaction === 'happy') && 'animate-egg-sway',
            !isTapWiggling && reaction === 'singing' && 'animate-egg-bounce',
            // Warmth effect only when animated AND warm
            animated && actualWarmth > 60 && 'animate-egg-warmth',
            // Cracking overrides other animations (legacy prop or tour crack stages)
            // During 'opening' the shell runs its own open animation, so suppress the shake
            (cracking || (tourCrackLevel >= 1 && tourVisualState !== 'opening')) && 'animate-egg-crack',
            // Opening/hatching: fade out the egg shell (crack overlay stays inside and fades with it)
            tourVisualState === 'opening' && 'animate-egg-tour-open',
            tourVisualState === 'hatching' && 'opacity-0',
          )}
          style={{
            width: '80%',
            height: '100%',
            background: createEggGradient(),
            borderRadius: '50% 50% 50% 50% / 60% 60% 40% 40%',
            boxShadow: `
              inset -0.5em -0.5em 1em ${shadow}33,
              inset 0.5em 0.5em 1em ${highlight}26
            `,
            filter: (cracking || tourCrackLevel >= 1) ? 'brightness(1.1)' : 'brightness(1)',
          }}
        >
          {/* Highlight on the egg - uses color variants instead of white */}
          <div
            className="absolute"
            style={{
              top: '20%',
              left: '25%',
              width: '30%',
              height: '25%',
              background: (() => {
                const effectiveBaseColor = isDivine ? DIVINE_PRIMARY_GREEN : baseColor;
                const colors = createColorVariants(effectiveBaseColor);
                // Use a subtle highlight variant instead of white for better color consistency
                return `linear-gradient(135deg, ${colors.highlight}80 0%, transparent 100%)`;
              })(),
              borderRadius: '50%',
              filter: 'blur(2px)',
            }}
          />

          {/* Pattern overlay - REMOVED VISUAL DISPLAY BUT DATA PRESERVED */}
          {/* {createPatternOverlay()} */}

          {/* Special marks based on effectiveSpecialMark */}
          {effectiveSpecialMark &&
            (effectiveSpecialMark === 'divine_wordmark' ? (
              // Divine wordmark "diVine" on the egg (bottom-left, diagonal)
              <div
                className="absolute"
                style={{
                  right: '15%',
                  bottom: '10%',
                  transform: 'rotate(-18deg)',
                  fontFamily: '"Pacifico", system-ui, cursive',
                  fontSize: '1.2em', // Relative sizing
                  color: '#FFFFFF',
                  textShadow: '0 1px 2px rgba(0,0,0,0.35)',
                  pointerEvents: 'none',
                  whiteSpace: 'nowrap',
                }}
              >
                diVine
              </div>
            ) : isSpecialMarkSupported(effectiveSpecialMark) ? (
              <SpecialMarkRenderer
                specialMark={effectiveSpecialMark}
                animated={specialMarkHook.isAnimated}
                opacity={specialMarkHook.opacity}
                className={specialMarkHook.getAnimationClass()}
              />
            ) : specialMarkHook.useFallback ? (
              <SpecialMarkFallback specialMark={effectiveSpecialMark} />
            ) : (
              renderLegacySpecialMark(effectiveSpecialMark)
            ))}

          {/* Crack pattern - stage-specific paths that grow outward from center */}
          {(cracking || tourShowCrack) && (() => {
            // Legacy cracking shows full crack; tour uses progressive stage-specific paths
            const level = cracking ? 3 : tourCrackLevel;
            return (
              <svg
                className="absolute inset-0 pointer-events-none w-full h-full transition-opacity duration-300"
                viewBox="0 0 120 125"
                preserveAspectRatio="xMidYMid meet"
                style={{ height: '100%' }}
              >
                {/*
                  Stage-specific crack paths.
                  Each level has its OWN distinct paths that expand outward from the egg center.
                  The crack grows from a small central cluster to full-width fracture.

                  Viewbox center is roughly (60, 62).
                  Level 0: tiny central crack (~3-4 small connected segments near center)
                  Level 1: extends left/right from center, first branches
                  Level 2: reaches further toward edges, more fracture detail
                  Level 3: crack reaches near shell edges, dense branching
                */}

                {/* ── Level 0: Small central crack ── */}
                {/* A few short connected segments clustered around the center of the egg */}
                {level === 0 && (<>
                  {/* Main tiny crack: ~15px wide, centered */}
                  <path
                    d="M53 63 L57 60 L63 64 L67 61"
                    stroke="rgba(0, 0, 0, 0.5)"
                    strokeWidth="1.2"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  {/* Tiny upward branch from center */}
                  <path
                    d="M57 60 L56 57"
                    stroke="rgba(0, 0, 0, 0.35)"
                    strokeWidth="0.8"
                    fill="none"
                    strokeLinecap="round"
                  />
                  {/* Tiny downward branch */}
                  <path
                    d="M63 64 L65 67"
                    stroke="rgba(0, 0, 0, 0.35)"
                    strokeWidth="0.8"
                    fill="none"
                    strokeLinecap="round"
                  />
                  {/* Subtle highlight alongside main crack */}
                  <path
                    d="M54 64 L58 61 L64 65"
                    stroke="rgba(255, 255, 255, 0.12)"
                    strokeWidth="0.6"
                    fill="none"
                    strokeLinecap="round"
                  />
                </>)}

                {/* ── Level 1: Medium crack expanding from center ── */}
                {/* Crack extends ~30px wide, first real branches appear */}
                {level === 1 && (<>
                  {/* Main crack: wider than level 0, extends left and right */}
                  <path
                    d="M42 61 L48 64 L53 60 L60 65 L67 59 L73 63 L78 60"
                    stroke="rgba(0, 0, 0, 0.55)"
                    strokeWidth="1.5"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  {/* Highlight */}
                  <path
                    d="M43 62 L49 65 L54 61 L61 66 L68 60 L74 64"
                    stroke="rgba(255, 255, 255, 0.12)"
                    strokeWidth="0.6"
                    fill="none"
                    strokeLinecap="round"
                  />
                  {/* Branch: upward left */}
                  <path d="M48 64 L46 69" stroke="rgba(0, 0, 0, 0.4)" strokeWidth="1" strokeLinecap="round" />
                  {/* Branch: upward from center-right */}
                  <path d="M67 59 L65 54" stroke="rgba(0, 0, 0, 0.4)" strokeWidth="1" strokeLinecap="round" />
                  {/* Branch: downward right */}
                  <path d="M73 63 L76 68" stroke="rgba(0, 0, 0, 0.35)" strokeWidth="0.9" strokeLinecap="round" />
                  {/* Small micro-branch */}
                  <path d="M53 60 L51 56" stroke="rgba(0, 0, 0, 0.3)" strokeWidth="0.7" strokeLinecap="round" />
                </>)}

                {/* ── Level 2: Larger crack reaching toward sides ── */}
                {/* Crack extends ~60px wide, more branching detail */}
                {level === 2 && (<>
                  {/* Main crack: extends well toward both sides */}
                  <path
                    d="M30 63 L37 60 L44 65 L52 59 L60 64 L68 58 L76 63 L83 59 L90 64"
                    stroke="rgba(0, 0, 0, 0.6)"
                    strokeWidth="2"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  {/* Highlight */}
                  <path
                    d="M31 64 L38 61 L45 66 L53 60 L61 65 L69 59 L77 64 L84 60"
                    stroke="rgba(255, 255, 255, 0.12)"
                    strokeWidth="0.7"
                    fill="none"
                    strokeLinecap="round"
                  />
                  {/* Branches: left side */}
                  <path d="M37 60 L34 55" stroke="rgba(0, 0, 0, 0.45)" strokeWidth="1.1" strokeLinecap="round" />
                  <path d="M44 65 L41 71" stroke="rgba(0, 0, 0, 0.4)" strokeWidth="1" strokeLinecap="round" />
                  {/* Branches: center */}
                  <path d="M52 59 L50 53" stroke="rgba(0, 0, 0, 0.4)" strokeWidth="1" strokeLinecap="round" />
                  <path d="M60 64 L63 70" stroke="rgba(0, 0, 0, 0.4)" strokeWidth="1" strokeLinecap="round" />
                  {/* Branches: right side */}
                  <path d="M68 58 L66 52" stroke="rgba(0, 0, 0, 0.45)" strokeWidth="1.1" strokeLinecap="round" />
                  <path d="M76 63 L79 69" stroke="rgba(0, 0, 0, 0.4)" strokeWidth="1" strokeLinecap="round" />
                  <path d="M83 59 L86 54" stroke="rgba(0, 0, 0, 0.35)" strokeWidth="0.9" strokeLinecap="round" />
                  {/* Micro-cracks */}
                  <path d="M50 53 L48 50" stroke="rgba(0, 0, 0, 0.25)" strokeWidth="0.7" strokeLinecap="round" />
                  <path d="M63 70 L66 73" stroke="rgba(0, 0, 0, 0.25)" strokeWidth="0.7" strokeLinecap="round" />
                </>)}

                {/* ── Level 3: Full crack reaching shell edges ── */}
                {/* Crack spans nearly the full width, dense fracture network */}
                {level >= 3 && (<>
                  {/* Main crack: nearly full width of egg */}
                  <path
                    d="M15 62 L23 59 L32 64 L40 58 L50 65 L60 57 L70 64 L80 58 L88 63 L96 59 L105 64"
                    stroke="rgba(0, 0, 0, 0.65)"
                    strokeWidth="2.5"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  {/* Highlight */}
                  <path
                    d="M16 63 L24 60 L33 65 L41 59 L51 66 L61 58 L71 65 L81 59 L89 64 L97 60"
                    stroke="rgba(255, 255, 255, 0.13)"
                    strokeWidth="0.8"
                    fill="none"
                    strokeLinecap="round"
                  />
                  {/* Heavy branches: left region */}
                  <path d="M23 59 L19 53" stroke="rgba(0, 0, 0, 0.5)" strokeWidth="1.3" strokeLinecap="round" />
                  <path d="M32 64 L28 72" stroke="rgba(0, 0, 0, 0.45)" strokeWidth="1.2" strokeLinecap="round" />
                  <path d="M28 72 L25 76" stroke="rgba(0, 0, 0, 0.3)" strokeWidth="0.9" strokeLinecap="round" />
                  {/* Heavy branches: center-left */}
                  <path d="M40 58 L37 51" stroke="rgba(0, 0, 0, 0.5)" strokeWidth="1.2" strokeLinecap="round" />
                  <path d="M50 65 L47 73" stroke="rgba(0, 0, 0, 0.45)" strokeWidth="1.2" strokeLinecap="round" />
                  <path d="M37 51 L35 47" stroke="rgba(0, 0, 0, 0.3)" strokeWidth="0.8" strokeLinecap="round" />
                  {/* Heavy branches: center */}
                  <path d="M60 57 L58 50" stroke="rgba(0, 0, 0, 0.5)" strokeWidth="1.3" strokeLinecap="round" />
                  <path d="M60 57 L63 68" stroke="rgba(0, 0, 0, 0.4)" strokeWidth="1.1" strokeLinecap="round" />
                  {/* Heavy branches: center-right */}
                  <path d="M70 64 L73 71" stroke="rgba(0, 0, 0, 0.45)" strokeWidth="1.2" strokeLinecap="round" />
                  <path d="M80 58 L83 50" stroke="rgba(0, 0, 0, 0.5)" strokeWidth="1.3" strokeLinecap="round" />
                  <path d="M83 50 L86 46" stroke="rgba(0, 0, 0, 0.3)" strokeWidth="0.8" strokeLinecap="round" />
                  {/* Heavy branches: right region */}
                  <path d="M88 63 L91 70" stroke="rgba(0, 0, 0, 0.45)" strokeWidth="1.2" strokeLinecap="round" />
                  <path d="M96 59 L99 52" stroke="rgba(0, 0, 0, 0.5)" strokeWidth="1.2" strokeLinecap="round" />
                  <path d="M105 64 L109 70" stroke="rgba(0, 0, 0, 0.4)" strokeWidth="1.1" strokeLinecap="round" />
                  {/* Micro-cracks (tertiary detail) */}
                  <path d="M47 73 L44 77" stroke="rgba(0, 0, 0, 0.25)" strokeWidth="0.7" strokeLinecap="round" />
                  <path d="M73 71 L76 75" stroke="rgba(0, 0, 0, 0.25)" strokeWidth="0.7" strokeLinecap="round" />
                  <path d="M58 50 L55 46" stroke="rgba(0, 0, 0, 0.25)" strokeWidth="0.7" strokeLinecap="round" />
                  <path d="M19 53 L17 49" stroke="rgba(0, 0, 0, 0.2)" strokeWidth="0.6" strokeLinecap="round" />
                  <path d="M99 52 L102 48" stroke="rgba(0, 0, 0, 0.2)" strokeWidth="0.6" strokeLinecap="round" />
                </>)}
              </svg>
            );
          })()}

          {/* Title display for special eggs */}
          {blobbi?.title && (
            <div
              className="absolute -bottom-6 left-1/2 transform -translate-x-1/2 text-xs font-semibold text-center px-2 py-1 bg-black/20 rounded-full backdrop-blur-sm"
              style={{
                color: baseColor,
                textShadow: '0 1px 2px rgba(0,0,0,0.5)',
                fontSize: '0.75em', // Relative sizing
              }}
            >
              {blobbi.title}
            </div>
          )}
        </div>

        {/* Floating particles for magical effect - inside scaled container */}
        {animated && (
          <>
            <div
              className="absolute animate-ping"
              style={{
                top: '10%',
                left: '20%',
                width: '0.25em',
                height: '0.25em',
                background: 'rgba(251, 191, 36, 0.6)',
                borderRadius: '50%',
                animationDelay: '0s',
                animationDuration: '2s',
              }}
            />
            <div
              className="absolute animate-ping"
              style={{
                top: '20%',
                right: '15%',
                width: '0.2em',
                height: '0.2em',
                background: 'rgba(147, 197, 253, 0.6)',
                borderRadius: '50%',
                animationDelay: '0.5s',
                animationDuration: '2.5s',
              }}
            />
            <div
              className="absolute animate-ping"
              style={{
                bottom: '15%',
                left: '15%',
                width: '0.15em',
                height: '0.15em',
                background: 'rgba(167, 243, 208, 0.6)',
                borderRadius: '50%',
                animationDelay: '1s',
                animationDuration: '3s',
              }}
            />
          </>
        )}

        {/* ── Status Effects ─────────────────────────────────────────────── */}

        {/* Dirty effect: sweat droplet + dust at lower shell edges
            Placement rules for egg:
            - Sweat droplet stays at upper-left (outside egg, not on face)
            - Dust particles only at lower outer shell edges
            - Avoid center-front placement entirely
        */}
        {statusEffects?.dirty && (
          <>
            {/* Sweat droplet - upper left outside egg shell */}
            <div
              className="absolute animate-egg-sweat-drop"
              style={{
                top: '15%',
                left: '5%',
                width: '0.6em',
                height: '0.9em',
                background: 'linear-gradient(180deg, rgba(147, 197, 253, 0.9) 0%, rgba(59, 130, 246, 0.7) 100%)',
                borderRadius: '50% 50% 50% 50% / 30% 30% 70% 70%',
                zIndex: 20,
              }}
            />
            {/* Dust particles underneath (back layer) - at lower edges */}
            <div
              className="absolute animate-egg-dust"
              style={{
                bottom: '-5%',
                left: '20%',
                width: '60%',
                height: '0.4em',
                display: 'flex',
                justifyContent: 'space-between',
                zIndex: 5,
              }}
            >
              {/* Left edge particle */}
              <div
                style={{
                  width: '0.3em',
                  height: '0.3em',
                  background: 'rgba(87, 83, 78, 0.7)',
                  borderRadius: '50%',
                }}
                className="animate-egg-dust-particle"
              />
              {/* Right edge particle */}
              <div
                style={{
                  width: '0.28em',
                  height: '0.28em',
                  background: 'rgba(87, 83, 78, 0.65)',
                  borderRadius: '50%',
                  animationDelay: '0.4s',
                }}
                className="animate-egg-dust-particle"
              />
            </div>
            {/* Front-layer dust - at lower-left and lower-right edges
                More visible than back layer, stronger colors */}
            {/* Lower-left edge particle - larger, more visible */}
            <div
              className="absolute animate-egg-dust-particle"
              style={{
                bottom: '12%',
                left: '6%',
                width: '0.28em',
                height: '0.28em',
                background: 'rgba(63, 63, 70, 0.8)',
                borderRadius: '50%',
                zIndex: 25,
                animationDelay: '0.1s',
              }}
            />
            {/* Lower-right edge particle */}
            <div
              className="absolute animate-egg-dust-particle"
              style={{
                bottom: '15%',
                right: '5%',
                width: '0.25em',
                height: '0.25em',
                background: 'rgba(63, 63, 70, 0.75)',
                borderRadius: '50%',
                zIndex: 25,
                animationDelay: '0.5s',
              }}
            />
            {/* Very bottom left particle */}
            <div
              className="absolute animate-egg-dust-particle"
              style={{
                bottom: '5%',
                left: '18%',
                width: '0.22em',
                height: '0.22em',
                background: 'rgba(68, 64, 60, 0.7)',
                borderRadius: '50%',
                zIndex: 25,
                animationDelay: '0.8s',
              }}
            />
            {/* Very bottom right particle */}
            <div
              className="absolute animate-egg-dust-particle"
              style={{
                bottom: '3%',
                right: '20%',
                width: '0.2em',
                height: '0.2em',
                background: 'rgba(68, 64, 60, 0.65)',
                borderRadius: '50%',
                zIndex: 25,
                animationDelay: '1.1s',
              }}
            />
          </>
        )}

        {/* Sick effect: layered dizzy spirals around and across egg
            Creates a magical/dizzy atmosphere with multiple spiral layers:
            - Outer spirals: floating around the egg shell
            - Inner spirals: across the egg body itself
            - Mixed colors: gray (primary) + white (accents)
            - Varying sizes, speeds, and rotation directions
            All use true Archimedean spiral paths matching Blobbi dizzy eyes
        */}
        {statusEffects?.sick && (
          <>
            {/* ═══ OUTER SPIRALS (floating around egg) ═══ */}
            
            {/* Outer 1 - top left, large, gray, COUNTER-CLOCKWISE path */}
            <svg
              className="absolute"
              style={{
                top: '0%',
                left: '-5%',
                width: '1.1em',
                height: '1.1em',
                zIndex: 20,
                overflow: 'visible',
              }}
              viewBox="0 0 20 20"
            >
              <g>
                <path
                  d={createEggSpiralPath(10, 10, 8, false)}
                  stroke="#4b5563"
                  strokeWidth="1.5"
                  fill="none"
                  strokeLinecap="round"
                  opacity="0.65"
                />
                <animateTransform
                  attributeName="transform"
                  type="rotate"
                  from="0 10 10"
                  to="360 10 10"
                  dur="2.5s"
                  repeatCount="indefinite"
                />
              </g>
            </svg>
            
            {/* Outer 2 - right side, medium, gray, CLOCKWISE path */}
            <svg
              className="absolute"
              style={{
                top: '25%',
                right: '-6%',
                width: '0.95em',
                height: '0.95em',
                zIndex: 20,
                overflow: 'visible',
              }}
              viewBox="0 0 20 20"
            >
              <g>
                <path
                  d={createEggSpiralPath(10, 10, 8, true)}
                  stroke="#6b7280"
                  strokeWidth="1.4"
                  fill="none"
                  strokeLinecap="round"
                  opacity="0.6"
                />
                <animateTransform
                  attributeName="transform"
                  type="rotate"
                  from="360 10 10"
                  to="0 10 10"
                  dur="2s"
                  repeatCount="indefinite"
                />
              </g>
            </svg>
            
            {/* Outer 3 - bottom left, small, white accent, COUNTER-CLOCKWISE path */}
            <svg
              className="absolute"
              style={{
                bottom: '15%',
                left: '-4%',
                width: '0.7em',
                height: '0.7em',
                zIndex: 20,
                overflow: 'visible',
              }}
              viewBox="0 0 20 20"
            >
              <g>
                <path
                  d={createEggSpiralPath(10, 10, 8, false)}
                  stroke="white"
                  strokeWidth="1.3"
                  fill="none"
                  strokeLinecap="round"
                  opacity="0.5"
                />
                <animateTransform
                  attributeName="transform"
                  type="rotate"
                  from="360 10 10"
                  to="0 10 10"
                  dur="3s"
                  repeatCount="indefinite"
                />
              </g>
            </svg>
            
            {/* Outer 4 - bottom right, tiny, gray, CLOCKWISE path */}
            <svg
              className="absolute"
              style={{
                bottom: '8%',
                right: '-3%',
                width: '0.6em',
                height: '0.6em',
                zIndex: 20,
                overflow: 'visible',
              }}
              viewBox="0 0 20 20"
            >
              <g>
                <path
                  d={createEggSpiralPath(10, 10, 8, true)}
                  stroke="#9ca3af"
                  strokeWidth="1.2"
                  fill="none"
                  strokeLinecap="round"
                  opacity="0.5"
                />
                <animateTransform
                  attributeName="transform"
                  type="rotate"
                  from="0 10 10"
                  to="360 10 10"
                  dur="3.5s"
                  repeatCount="indefinite"
                />
              </g>
            </svg>
            
            {/* ═══ INNER SPIRALS (across egg body) ═══ */}
            
            {/* Inner 1 - upper egg, small, white, COUNTER-CLOCKWISE path */}
            <svg
              className="absolute"
              style={{
                top: '18%',
                left: '22%',
                width: '0.55em',
                height: '0.55em',
                zIndex: 15,
                overflow: 'visible',
              }}
              viewBox="0 0 20 20"
            >
              <g>
                <path
                  d={createEggSpiralPath(10, 10, 7, false)}
                  stroke="white"
                  strokeWidth="1.2"
                  fill="none"
                  strokeLinecap="round"
                  opacity="0.4"
                />
                <animateTransform
                  attributeName="transform"
                  type="rotate"
                  from="0 10 10"
                  to="360 10 10"
                  dur="4s"
                  repeatCount="indefinite"
                />
              </g>
            </svg>
            
            {/* Inner 2 - mid-right egg, tiny, gray, CLOCKWISE path */}
            <svg
              className="absolute"
              style={{
                top: '40%',
                right: '18%',
                width: '0.5em',
                height: '0.5em',
                zIndex: 15,
                overflow: 'visible',
              }}
              viewBox="0 0 20 20"
            >
              <g>
                <path
                  d={createEggSpiralPath(10, 10, 7, true)}
                  stroke="#6b7280"
                  strokeWidth="1.1"
                  fill="none"
                  strokeLinecap="round"
                  opacity="0.35"
                />
                <animateTransform
                  attributeName="transform"
                  type="rotate"
                  from="360 10 10"
                  to="0 10 10"
                  dur="3s"
                  repeatCount="indefinite"
                />
              </g>
            </svg>
            
            {/* Inner 3 - lower-center egg, small, white accent */}
            <svg
              className="absolute"
              style={{
                bottom: '28%',
                left: '35%',
                width: '0.45em',
                height: '0.45em',
                zIndex: 15,
                overflow: 'visible',
              }}
              viewBox="0 0 20 20"
            >
              <g>
                <path
                  d={createEggSpiralPath(10, 10, 7, false)}
                  stroke="white"
                  strokeWidth="1"
                  fill="none"
                  strokeLinecap="round"
                  opacity="0.35"
                />
                <animateTransform
                  attributeName="transform"
                  type="rotate"
                  from="0 10 10"
                  to="360 10 10"
                  dur="3.5s"
                  repeatCount="indefinite"
                />
              </g>
            </svg>
          </>
        )}

        {/* Happy effect: subtle sparkles around egg */}
        {statusEffects?.happy && (
          <>
            {/* Sparkle 1 - top */}
            <div
              className="absolute animate-egg-sparkle"
              style={{
                top: '5%',
                left: '45%',
                width: '0.5em',
                height: '0.5em',
                zIndex: 20,
              }}
            >
              <svg viewBox="0 0 20 20" className="w-full h-full">
                <path
                  d="M10 0 L10 20 M0 10 L20 10 M3 3 L17 17 M17 3 L3 17"
                  stroke="rgba(251, 191, 36, 0.8)"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </div>
            {/* Sparkle 2 - right */}
            <div
              className="absolute animate-egg-sparkle"
              style={{
                top: '25%',
                right: '0%',
                width: '0.4em',
                height: '0.4em',
                zIndex: 20,
                animationDelay: '0.4s',
              }}
            >
              <svg viewBox="0 0 20 20" className="w-full h-full">
                <path
                  d="M10 0 L10 20 M0 10 L20 10"
                  stroke="rgba(251, 191, 36, 0.7)"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </div>
            {/* Sparkle 3 - left */}
            <div
              className="absolute animate-egg-sparkle"
              style={{
                top: '40%',
                left: '0%',
                width: '0.35em',
                height: '0.35em',
                zIndex: 20,
                animationDelay: '0.8s',
              }}
            >
              <svg viewBox="0 0 20 20" className="w-full h-full">
                <path
                  d="M10 0 L10 20 M0 10 L20 10"
                  stroke="rgba(251, 191, 36, 0.6)"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
