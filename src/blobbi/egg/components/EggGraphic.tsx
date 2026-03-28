import React from 'react';
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

interface EggGraphicProps {
  blobbi?: EggVisualBlobbi; // Visual blobbi object for visual properties
  sizeVariant?: 'tiny' | 'small' | 'medium' | 'large'; // Internal scaling only, NOT layout size
  className?: string;
  animated?: boolean; // Enable ambient effects (glow pulse, particles) but NOT sway
  reaction?: EggReactionState; // Reaction state for music/sing animations
  cracking?: boolean;
  warmth?: number; // 0-100, affects the glow (fallback if no blobbi)
  forceInlineSvg?: boolean; // New prop to guarantee inline SVG
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
        <div
          className={cn(
            'absolute rounded-full blur-xl transition-all duration-1000',
            animated && 'animate-pulse'
          )}
          style={{
            width: '120%',
            height: '120%',
            background: `radial-gradient(circle, ${glowColor} 0%, transparent 70%)`,
            zIndex: 0,
          }}
        />

        {/* Main egg shape - uses percentage-based sizing */}
        <div
          className={cn(
            'relative transition-all duration-500 z-10',
            // Reaction-based animations (music/sing)
            (reaction === 'listening' || reaction === 'swaying' || reaction === 'happy') && 'animate-egg-sway',
            reaction === 'singing' && 'animate-egg-bounce',
            // Warmth effect only when animated AND warm
            animated && actualWarmth > 60 && 'animate-egg-warmth',
            // Cracking overrides other animations
            cracking && 'animate-egg-crack'
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
            filter: cracking ? 'brightness(1.1)' : 'brightness(1)',
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

          {/* Crack pattern based on docs/aprovado.svg when cracking is true */}
          {cracking && (
            <svg
              className="absolute inset-0 pointer-events-none w-full h-full"
              viewBox="0 0 120 125"
              preserveAspectRatio="xMidYMid meet"
              style={{
                height: '100%',
              }}
            >
              {/* Main horizontal crack (adapted from aprovado.svg) */}
              <path
                d="M10 62
                   L20 60
                   L30 64
                   L40 59
                   L50 65
                   L60 58
                   L70 66
                   L80 57
                   L90 67
                   L100 59
                   L110 65"
                stroke="rgba(0, 0, 0, 0.6)"
                strokeWidth="2"
                fill="none"
                strokeLinecap="round"
              />

              {/* Secondary cracks (adapted from aprovado.svg) */}
              <path
                d="M30 64 L28 70"
                stroke="rgba(0, 0, 0, 0.4)"
                strokeWidth="1"
                strokeLinecap="round"
              />
              <path
                d="M50 65 L53 71"
                stroke="rgba(0, 0, 0, 0.4)"
                strokeWidth="1"
                strokeLinecap="round"
              />
              <path
                d="M60 58 L57 52"
                stroke="rgba(0, 0, 0, 0.4)"
                strokeWidth="1"
                strokeLinecap="round"
              />
              <path
                d="M80 57 L82 50"
                stroke="rgba(0, 0, 0, 0.4)"
                strokeWidth="1"
                strokeLinecap="round"
              />
              <path
                d="M90 67 L95 72"
                stroke="rgba(0, 0, 0, 0.4)"
                strokeWidth="1"
                strokeLinecap="round"
              />
              <path
                d="M100 59 L97 53"
                stroke="rgba(0, 0, 0, 0.4)"
                strokeWidth="1"
                strokeLinecap="round"
              />
              <path
                d="M110 65 L113 69"
                stroke="rgba(0, 0, 0, 0.4)"
                strokeWidth="1"
                strokeLinecap="round"
              />

              {/* Additional micro-cracks for detail */}
              <path
                d="M40 59 L38 55"
                stroke="rgba(0, 0, 0, 0.25)"
                strokeWidth="0.8"
                strokeLinecap="round"
              />
              <path
                d="M70 66 L73 70"
                stroke="rgba(0, 0, 0, 0.25)"
                strokeWidth="0.8"
                strokeLinecap="round"
              />
              <path
                d="M20 60 L18 56"
                stroke="rgba(0, 0, 0, 0.2)"
                strokeWidth="0.6"
                strokeLinecap="round"
              />

              {/* Crack highlights for depth (following the main crack pattern) */}
              <path
                d="M10 63
                   L20 61
                   L30 65
                   L40 60
                   L50 66
                   L60 59
                   L70 67
                   L80 58
                   L90 68
                   L100 60
                   L110 66"
                stroke="rgba(255, 255, 255, 0.15)"
                strokeWidth="0.8"
                fill="none"
                strokeLinecap="round"
              />

              {/* Secondary crack highlights */}
              <path
                d="M30 65 L28 71"
                stroke="rgba(255, 255, 255, 0.1)"
                strokeWidth="0.4"
                strokeLinecap="round"
              />
              <path
                d="M60 59 L57 53"
                stroke="rgba(255, 255, 255, 0.1)"
                strokeWidth="0.4"
                strokeLinecap="round"
              />
            </svg>
          )}

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
      </div>
    </div>
  );
};
