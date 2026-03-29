/**
 * Blobbi Emotion System
 *
 * Provides a simple, extensible way to apply emotional expressions to Blobbies.
 * Works as an SVG overlay/modification system that doesn't change the base SVG structure.
 *
 * Design principles:
 * - Keep base SVG intact (neutral state)
 * - Override only emotion-specific parts: pupils, mouth, eyebrows, tears
 * - System is additive - emotions add elements rather than replace base
 * - Easy to extend with new emotions
 * - Use SVG markers (<!-- Eyes -->, <!-- Pupils -->, <!-- Mouth -->) when available
 * - Fall back to regex parsing for backward compatibility
 * - Deterministic behavior (no random flickering)
 *
 * Eye-related effects are delegated to the eye system module for consistency.
 */

import {
  // Detection
  detectEyePositions as detectEyesFromEyeSystem,
  // Effects - imported with aliases to allow gradual migration
  applySadEyes as applySadEyesFromEyeSystem,
  applyStarEyes as applyStarEyesFromEyeSystem,
  applyDizzyEyes as applyDizzyEyesFromEyeSystem,
  // Types and constants
  type EyePosition,
  EYE_CLASSES,
} from './eyes';

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Available emotion states for Blobbies
 */
export type BlobbiEmotion = 'neutral' | 'sad' | 'happy' | 'angry' | 'surprised' | 'sleepy' | 'curious' | 'dizzy' | 'excited' | 'excitedB' | 'mischievous' | 'adoring' | 'hungry';

/**
 * Blobbi variant for variant-specific adjustments
 */
export type BlobbiVariant = 'baby' | 'adult';

/**
 * Configuration for emotion visual modifications
 */
export interface EmotionConfig {
  /** Modify pupil highlights for watery/sad eyes */
  pupilModification?: PupilModification;
  /** Override mouth curve (positive = smile, negative = frown) */
  mouthCurve?: number;
  /** Replace mouth with a round "O" shape */
  roundMouth?: RoundMouthConfig;
  /** Add eyebrows with specified angle */
  eyebrows?: EyebrowConfig;
  /** Add tears animation */
  tears?: TearConfig;
  /** Body color effect (e.g., anger rising red) */
  bodyEffect?: BodyEffectConfig;
  /** Sleepy tired-blink animation */
  sleepyAnimation?: SleepyAnimationConfig;
  /** Dizzy spiral eyes effect */
  dizzyEffect?: DizzyEffectConfig;
  /** Animated eyebrow bouncing (for excited/mischievous) */
  animatedEyebrows?: AnimatedEyebrowsConfig;
  /** Small/smug smile (for mischievous) */
  smallSmile?: SmallSmileConfig;
  /** Star eyes effect (replaces normal eyes with stars) */
  starEyes?: StarEyesConfig;
  /** Big smile mouth (wider than normal) */
  bigSmile?: BigSmileConfig;
  /** Drool drop from corner of mouth */
  drool?: DroolConfig;
  /** Food icon (fork/knife) above head */
  foodIcon?: FoodIconConfig;
  /** Droopy/weak mouth (less curved than sad) */
  droopyMouth?: DroopyMouthConfig;
}

export interface PupilModification {
  /** Add watery eye effect with repositioned highlights */
  wateryEyes: boolean;
  /** Include blue watery fill at bottom of eye (default: true when wateryEyes is true) */
  includeWaterFill?: boolean;
}

export interface EyebrowConfig {
  /** Angle in degrees (positive = worried, negative = angry) */
  angle: number;
  /** Vertical offset from eye center */
  offsetY: number;
  /** Stroke width */
  strokeWidth: number;
  /** Color */
  color: string;
  /** Optional curve amount (0 = straight, positive = curved upward like a frown brow) */
  curve?: number;
  /** 
   * Optional per-eye overrides for asymmetric expressions.
   * If set, these values override the base config for that specific eye.
   */
  leftEyeOverride?: Partial<Omit<EyebrowConfig, 'leftEyeOverride' | 'rightEyeOverride'>>;
  rightEyeOverride?: Partial<Omit<EyebrowConfig, 'leftEyeOverride' | 'rightEyeOverride'>>;
}

export interface RoundMouthConfig {
  /** Horizontal radius of the mouth */
  rx: number;
  /** Vertical radius of the mouth (use same as rx for circle) */
  ry: number;
  /** Whether to fill the mouth (true) or just stroke it (false) */
  filled?: boolean;
}

export interface TearConfig {
  /** Enable tear animation */
  enabled: boolean;
  /** Tear falls from which eye */
  eye: 'left' | 'right' | 'random' | 'both' | 'alternating';
  /** Animation duration in seconds (full cycle: appear, fall, fade) */
  duration: number;
  /** Pause between tear cycles in seconds (optional) */
  pauseBetween?: number;
}

export interface BodyEffectConfig {
  /** Type of body effect */
  type: 'anger-rise';
  /** Color for the effect (e.g., red for anger) */
  color: string;
  /** Animation duration in seconds */
  duration: number;
}

export interface SleepyAnimationConfig {
  /** Enable the sleepy tired-blink animation */
  enabled: boolean;
  /** Total duration of one full cycle (3 blinks + mouth animation) in seconds */
  cycleDuration: number;
}

export interface DizzyEffectConfig {
  /** Enable spiral eyes effect */
  enabled: boolean;
  /** Rotation duration in seconds for one full spiral rotation */
  rotationDuration: number;
}

export interface AnimatedEyebrowsConfig {
  /** Enable animated eyebrow bouncing */
  enabled: boolean;
  /** Duration of one bounce cycle in seconds */
  bounceDuration: number;
  /** Amount to move eyebrows up during bounce (in pixels) */
  bounceAmount: number;
}

export interface SmallSmileConfig {
  /** Scale factor for the smile (0.5 = half size, 1.0 = normal) */
  scale: number;
}

export interface StarEyesConfig {
  /** Enable star eyes effect */
  enabled: boolean;
  /** Number of points on the star (default: 5) */
  points?: number;
  /** Fill color for the stars (default: golden yellow) */
  color?: string;
  /** Scale factor relative to pupil size (default: 1.5) */
  scale?: number;
}

export interface BigSmileConfig {
  /** Scale factor for the smile width (1.0 = normal, 1.5 = 50% wider) */
  widthScale: number;
  /** Scale factor for the smile curve depth (1.0 = normal, 1.5 = deeper curve) */
  curveScale: number;
}

export interface DroolConfig {
  /** Enable drool effect */
  enabled: boolean;
  /** Which side of the mouth the drool appears (default: 'right') */
  side?: 'left' | 'right';
}

export interface FoodIconConfig {
  /** Enable food icon above head */
  enabled: boolean;
  /** Icon type (default: 'utensils') */
  type?: 'utensils' | 'plate';
}

export interface DroopyMouthConfig {
  /** Scale factor for mouth width (smaller = narrower, more tired look) */
  widthScale: number;
  /** Scale factor for curve depth (smaller = less pronounced frown) */
  curveScale: number;
}

// ─── Emotion Configurations ───────────────────────────────────────────────────

/**
 * Predefined emotion configurations
 */
/**
 * Predefined emotion configurations
 * 
 * NOTE: The base/default Blobbi expression is visually "happy" (smiling mouth).
 * The 'neutral' key means "no modifications" - it keeps the default happy look.
 */
export const EMOTION_CONFIGS: Record<BlobbiEmotion, EmotionConfig> = {
  neutral: {
    // No modifications - keeps the default happy-looking expression
  },
  sad: {
    pupilModification: {
      wateryEyes: true,
    },
    mouthCurve: -1, // Invert the smile to a frown
    eyebrows: {
      angle: -15, // Worried/sad angle: eyebrows angle UP toward center (/\)
      offsetY: -10, // Positioned above eyes
      strokeWidth: 1.5, // Thinner, subtle
      color: '#374151', // Slightly lighter
    },
    tears: {
      enabled: true,
      eye: 'alternating', // Alternates between eyes over time
      duration: 6, // Slower: 6 seconds per tear cycle
      pauseBetween: 3, // 3 second pause between tears
    },
  },
  happy: {
    // The base expression is already happy, so minimal changes needed
    mouthCurve: 1.2, // Slightly bigger smile if desired
  },
  angry: {
    mouthCurve: -0.5, // Slight frown
    eyebrows: {
      angle: 20, // Angry angle: eyebrows angle DOWN toward center (\/)
      offsetY: -10, // Positioned above eyes
      strokeWidth: 2.5, // Thick, prominent
      color: '#1f2937', // Dark
    },
    bodyEffect: {
      type: 'anger-rise',
      color: '#ef4444', // Red-500
      duration: 2, // 2 seconds to fill
    },
  },
  surprised: {
    roundMouth: {
      rx: 5, // Larger round mouth for surprise
      ry: 6,
      filled: true,
    },
    eyebrows: {
      angle: -12, // Raised eyebrows (similar direction to sad but less intense)
      offsetY: -12, // Higher up for "opened up" look
      strokeWidth: 1.5,
      color: '#374151',
      curve: 0.3, // Slight upward curve
    },
  },
  sleepy: {
    sleepyAnimation: {
      enabled: true,
      cycleDuration: 8, // 8 seconds for one full cycle (slow, tired feel)
    },
  },
  curious: {
    roundMouth: {
      rx: 3, // Smaller round mouth for curious
      ry: 3.5,
      filled: true,
    },
    eyebrows: {
      angle: -8, // Base angle for both eyebrows
      offsetY: -11, // Positioned above eyes
      strokeWidth: 1.3, // Thinner, subtle
      color: '#4b5563', // Lighter gray
      curve: 0.15, // Subtle curve
      // Raise the right eyebrow slightly more for a "questioning" look
      rightEyeOverride: {
        angle: -14, // More raised angle
        offsetY: -12.5, // Slightly higher
        curve: 0.25, // More pronounced curve
      },
    },
  },
  dizzy: {
    // Spiral eyes replace normal eyes entirely
    dizzyEffect: {
      enabled: true,
      rotationDuration: 2, // 2 seconds per rotation
    },
    // Round "dazed" mouth
    roundMouth: {
      rx: 4,
      ry: 5,
      filled: true,
    },
  },
  excited: {
    // Star eyes replace normal pupils - smaller and tracks with eye movement
    starEyes: {
      enabled: true,
      points: 5, // 5-pointed star
      color: '#fbbf24', // Golden yellow (amber-400)
      scale: 0.9, // Slightly smaller than pupil for cute look
    },
    // Big happy smile
    bigSmile: {
      widthScale: 1.3, // 30% wider
      curveScale: 1.4, // 40% deeper curve for extra happy look
    },
  },
  excitedB: {
    // Variation B: star eyes + round mouth (like curious)
    starEyes: {
      enabled: true,
      points: 5, // 5-pointed star
      color: '#fbbf24', // Golden yellow (amber-400)
      scale: 0.9, // Same as excited
    },
    // Round "O" mouth like curious (no smile)
    roundMouth: {
      rx: 3.5, // Slightly larger than curious
      ry: 4,
      filled: true,
    },
  },
  mischievous: {
    // Use the same eyebrow config as angry (V-shape), but with animation
    eyebrows: {
      angle: 20, // Same as angry
      offsetY: -10, // Same as angry
      strokeWidth: 2.5, // Same as angry
      color: '#1f2937', // Same as angry
    },
    // Animated eyebrows bouncing
    animatedEyebrows: {
      enabled: true,
      bounceDuration: 0.6, // Slightly slower than excited
      bounceAmount: 2.5, // Slightly less movement
    },
    // Small smug smile
    smallSmile: {
      scale: 0.7, // 70% of normal smile size
    },
  },
  adoring: {
    // Watery eyes with highlights but WITHOUT the blue water fill
    pupilModification: {
      wateryEyes: true,
      includeWaterFill: false, // No blue semicircle, only sad keeps that
    },
    // No eyebrows
    // Curious round mouth
    roundMouth: {
      rx: 3, // Same as curious
      ry: 3.5,
      filled: true,
    },
  },
  hungry: {
    // Watery eyes like sad, but WITHOUT the blue water fill (not crying, just wanting)
    pupilModification: {
      wateryEyes: true,
      includeWaterFill: false, // No blue semicircle - this is longing, not crying
    },
    // Same worried/longing eyebrows as sad
    eyebrows: {
      angle: -15, // Worried/sad angle: eyebrows angle UP toward center (/\)
      offsetY: -10, // Positioned above eyes
      strokeWidth: 1.5, // Thinner, subtle
      color: '#374151', // Slightly lighter
    },
    // Droopy mouth - less curved than sad, more "low energy" feeling
    droopyMouth: {
      widthScale: 0.85, // Slightly narrower (tired/weak)
      curveScale: 0.6, // Much less pronounced frown (soft droopy, not full frown)
    },
    // Drool from corner of mouth
    drool: {
      enabled: true,
      side: 'right', // Drool on right side of mouth
    },
    // Fork/knife icon above head
    foodIcon: {
      enabled: true,
      type: 'utensils',
    },
  },
};

// ─── Eye Position Detection ───────────────────────────────────────────────────

// EyePosition type is imported from the eye system module
export type { EyePosition } from './eyes';

export interface MouthPosition {
  startX: number;
  startY: number;
  controlX: number;
  controlY: number;
  endX: number;
  endY: number;
  /** Original stroke attributes from the SVG */
  strokeAttrs?: string;
}

/**
 * Detect eye positions from SVG content.
 * Delegates to the eye system module for consistent detection.
 *
 * @deprecated Use `detectEyePositions` from `./eyes` directly for new code.
 */
export function detectEyePositions(svgText: string): EyePosition[] {
  return detectEyesFromEyeSystem(svgText);
}

/**
 * Result of mouth detection including the raw SVG elements for replacement
 */
export interface MouthDetectionResult {
  position: MouthPosition;
  /** The SVG elements between <!-- Mouth --> marker and next section (for marker-based) */
  mouthElements?: string;
  /** Start index in SVG string where mouth elements begin */
  startIndex?: number;
  /** End index in SVG string where mouth elements end */
  endIndex?: number;
}

/**
 * Detect mouth position from SVG content.
 * 
 * Strategy:
 * 1. Primary: Look for <!-- Mouth --> marker and extract elements after it
 * 2. Fallback: Use regex to find mouth-like Q curve paths
 */
export function detectMouthPosition(svgText: string): MouthDetectionResult | null {
  // Primary: Try marker-based detection
  const markerResult = detectMouthByMarker(svgText);
  if (markerResult) {
    return markerResult;
  }
  
  // Fallback: Regex-based detection for unmarked SVGs
  return detectMouthByRegex(svgText);
}

/**
 * Detect mouth using <!-- Mouth --> marker
 */
function detectMouthByMarker(svgText: string): MouthDetectionResult | null {
  // Look for <!-- Mouth --> marker (case insensitive, allows extra text)
  const markerMatch = svgText.match(/<!--\s*Mouth[^>]*-->/i);
  if (!markerMatch || markerMatch.index === undefined) {
    return null;
  }
  
  const markerEndIndex = markerMatch.index + markerMatch[0].length;
  
  // Find the next section marker or significant element
  // Look for next comment marker, or closing elements that indicate end of mouth section
  const afterMarker = svgText.slice(markerEndIndex);
  const nextSectionMatch = afterMarker.match(/(?:<!--(?!\s*Mouth)|<(?:ellipse|circle|g|rect)[^>]*(?:id|class)=)/i);
  
  const mouthEndOffset = nextSectionMatch?.index ?? afterMarker.indexOf('</svg>');
  const mouthElements = afterMarker.slice(0, mouthEndOffset).trim();
  
  // Extract position from the mouth elements
  const position = extractMouthPositionFromElements(mouthElements);
  if (!position) {
    return null;
  }
  
  return {
    position,
    mouthElements,
    startIndex: markerEndIndex,
    endIndex: markerEndIndex + mouthEndOffset,
  };
}

/**
 * Extract mouth position from mouth SVG elements
 */
function extractMouthPositionFromElements(elements: string): MouthPosition | null {
  // Look for path with M...Q curve: M startX startY Q controlX controlY endX endY
  const pathMatch = elements.match(/d="M\s*([\d.]+)\s+([\d.]+)\s*Q\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)"/);
  if (pathMatch) {
    // Extract stroke-width for style preservation
    const strokeWidthMatch = elements.match(/stroke-width="([^"]*)"/);
    const strokeWidth = strokeWidthMatch ? strokeWidthMatch[1] : '2.5';
    
    return {
      startX: parseFloat(pathMatch[1]),
      startY: parseFloat(pathMatch[2]),
      controlX: parseFloat(pathMatch[3]),
      controlY: parseFloat(pathMatch[4]),
      endX: parseFloat(pathMatch[5]),
      endY: parseFloat(pathMatch[6]),
      strokeAttrs: `stroke="#1f2937" stroke-width="${strokeWidth}"`,
    };
  }
  return null;
}

/**
 * Fallback: Detect mouth using regex pattern matching
 */
function detectMouthByRegex(svgText: string): MouthDetectionResult | null {
  // Look for smile/mouth path with Q curve
  const mouthRegex = /<path[^>]*d="M\s*([\d.]+)\s+([\d.]+)\s*Q\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)"([^>]*stroke[^>]*)\/>/g;
  
  let match;
  while ((match = mouthRegex.exec(svgText)) !== null) {
    const startX = parseFloat(match[1]);
    const startY = parseFloat(match[2]);
    const controlX = parseFloat(match[3]);
    const controlY = parseFloat(match[4]);
    const endX = parseFloat(match[5]);
    const endY = parseFloat(match[6]);
    const strokePart = match[7] || '';
    
    // Check if this looks like a mouth (horizontal, in lower portion of typical blobbi)
    if (Math.abs(startY - endY) < 5 && startY > 40) {
      // Extract stroke-width from the matched attributes
      const strokeWidthMatch = strokePart.match(/stroke-width="([^"]*)"/);
      const strokeWidth = strokeWidthMatch ? strokeWidthMatch[1] : '2.5';
      
      return {
        position: {
          startX,
          startY,
          controlX,
          controlY,
          endX,
          endY,
          strokeAttrs: `stroke="#1f2937" stroke-width="${strokeWidth}"`,
        },
      };
    }
  }
  
  return null;
}

/**
 * Replace mouth <path> elements in the SVG with new mouth content.
 * 
 * SAFE APPROACH: Only targets <path> elements that match mouth patterns.
 * Does NOT slice or remove any other SVG content.
 * 
 * Strategy:
 * 1. Find mouth paths (Q-curve paths that look like mouths)
 * 2. Replace the FIRST one with the sad mouth
 * 3. Remove any additional mouth paths (for double-sided mouths like cat)
 * 4. Keep EVERYTHING else untouched
 * 
 * @param svgText - The SVG content
 * @param newMouthSvg - The replacement mouth SVG markup
 * @returns Modified SVG with mouth paths replaced (rest unchanged)
 */
function replaceMouthSection(svgText: string, newMouthSvg: string): string {
  // Mouth path pattern: <path ... d="M x y Q cx cy ex ey" ... stroke ... />
  // This matches Q-curve paths typically used for smile/frown mouths
  const mouthPathRegex = /<path[^>]*d="M\s*[\d.]+\s+[\d.]+\s*Q\s*[\d.]+\s+[\d.]+\s+[\d.]+\s+[\d.]+"[^>]*stroke[^>]*\/>/g;
  
  // Find all mouth path matches
  const matches = svgText.match(mouthPathRegex);
  
  if (!matches || matches.length === 0) {
    // No mouth paths found - return SVG unchanged (fail safe)
    return svgText;
  }
  
  // Replace ONLY the first mouth path with the sad mouth
  let replaced = false;
  return svgText.replace(mouthPathRegex, () => {
    if (!replaced) {
      replaced = true;
      // Replace first mouth path with the sad mouth
      return newMouthSvg;
    }
    // Remove additional mouth paths (e.g., cat has two paths for whisker-style mouth)
    // This prevents double-mouth but only removes OTHER mouth paths, nothing else
    return '';
  });
}

// ─── Utility Helpers ──────────────────────────────────────────────────────────

/**
 * Simple string hash function for deterministic seed generation.
 * Used to consistently select tear eye without Math.random() flickering.
 */
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return hash;
}

// ─── SVG Generation Helpers ───────────────────────────────────────────────────

/**
 * Generate eyebrow SVG elements
 * 
 * The eyebrow is wrapped in a <g> group that handles rotation/tilt.
 * The inner <path> has the class for CSS animation (translateY bounce).
 * This structure ensures that when CSS applies translateY animation,
 * it doesn't override the rotation transform - both are preserved.
 * 
 * Structure:
 *   <g transform="rotate(...)">        <!-- handles tilt/inclination -->
 *     <path class="blobbi-eyebrow" />  <!-- CSS animates translateY on this -->
 *   </g>
 * 
 * @param eyes - Eye positions
 * @param config - Eyebrow configuration
 * @param variant - Blobbi variant for variant-specific adjustments
 * @param form - Optional adult form for form-specific adjustments
 */
export function generateEyebrows(eyes: EyePosition[], config: EyebrowConfig, variant: BlobbiVariant = 'adult', form?: string): string {
  // Baby-specific adjustment: move eyebrows slightly farther from eyes
  let variantOffsetAdjustment = variant === 'baby' ? -2 : 0;
  
  // Form-specific adjustments for adult forms with larger eyes
  if (variant === 'adult' && form) {
    if (form === 'owli') {
      variantOffsetAdjustment = -12; // Owli has large round eyes, move eyebrows higher
    } else if (form === 'froggi') {
      variantOffsetAdjustment = -10; // Froggi has large eyes, move eyebrows higher
    }
  }
  
  return eyes.map(eye => {
    // Apply per-eye overrides if present
    const eyeOverride = eye.side === 'left' ? config.leftEyeOverride : config.rightEyeOverride;
    const effectiveAngle = eyeOverride?.angle ?? config.angle;
    const effectiveOffsetY = eyeOverride?.offsetY ?? config.offsetY;
    const effectiveCurve = eyeOverride?.curve ?? config.curve;
    const effectiveStrokeWidth = eyeOverride?.strokeWidth ?? config.strokeWidth;
    const effectiveColor = eyeOverride?.color ?? config.color;
    
    const browLength = eye.radius * 2;
    const browY = eye.cy + effectiveOffsetY + variantOffsetAdjustment;
    
    // Angle direction: positive rotates outer edge up (worried look)
    // For left eye, rotate around right end; for right eye, rotate around left end
    const angle = eye.side === 'left' ? effectiveAngle : -effectiveAngle;
    
    const startX = eye.cx - browLength / 2;
    const endX = eye.cx + browLength / 2;
    
    // Generate path - either straight line or curved
    let pathD: string;
    if (effectiveCurve && effectiveCurve !== 0) {
      // Curved eyebrow using quadratic bezier
      // Curve amount determines how much the control point is offset
      // Positive curve = curves upward (like a gentle arch)
      const curveAmount = effectiveCurve * eye.radius;
      const controlX = eye.cx;
      const controlY = browY - curveAmount;
      pathD = `M ${startX} ${browY} Q ${controlX} ${controlY} ${endX} ${browY}`;
    } else {
      // Straight line
      pathD = `M ${startX} ${browY} L ${endX} ${browY}`;
    }
    
    // Wrap in a group for rotation so CSS animation (translateY) doesn't override the tilt
    return `<g class="blobbi-eyebrow-group blobbi-eyebrow-group-${eye.side}" transform="rotate(${angle} ${eye.cx} ${browY})">
      <path 
        class="blobbi-eyebrow blobbi-eyebrow-${eye.side}"
        d="${pathD}" 
        stroke="${effectiveColor}" 
        stroke-width="${effectiveStrokeWidth}" 
        stroke-linecap="round"
        fill="none"
      />
    </g>`;
  }).join('\n');
}

/**
 * Generate round "O" mouth SVG for surprised/curious expressions.
 * 
 * The mouth is positioned at the center of where the original mouth was,
 * using the detected mouth position for accurate placement.
 */
export function generateRoundMouth(mouth: MouthPosition, config: RoundMouthConfig): string {
  // Calculate center of the original mouth
  const centerX = (mouth.startX + mouth.endX) / 2;
  // Position slightly lower than the smile baseline for a natural look
  const centerY = mouth.controlY;
  
  if (config.filled) {
    // Filled ellipse with gradient for depth
    return `<ellipse 
      class="blobbi-mouth blobbi-mouth-round"
      cx="${centerX}" 
      cy="${centerY}" 
      rx="${config.rx}" 
      ry="${config.ry}"
      fill="#1f2937"
    />`;
  } else {
    // Stroked ellipse (outline only)
    return `<ellipse 
      class="blobbi-mouth blobbi-mouth-round"
      cx="${centerX}" 
      cy="${centerY}" 
      rx="${config.rx}" 
      ry="${config.ry}"
      fill="none"
      stroke="#1f2937"
      stroke-width="2"
    />`;
  }
}

/**
 * Generate sad mouth SVG by inverting the original smile curve.
 * 
 * The original smile has the control point BELOW the baseline (making it curve down).
 * To create a frown, we flip the control point to be ABOVE the baseline by the same amount.
 * 
 * Original: M startX startY Q controlX controlY endX endY
 * - If controlY > startY, it's a smile (curves down)
 * - To invert: newControlY = startY - (controlY - startY)
 * 
 * The mouth is also shifted down slightly so the frown sits at a natural position
 * (inverting the curve alone makes it appear too high visually).
 */
export function generateSadMouth(mouth: MouthPosition): string {
  // Calculate the baseline Y (average of start and end Y)
  const baselineY = (mouth.startY + mouth.endY) / 2;
  
  // Calculate how much the original control point deviates from baseline
  const curveAmount = mouth.controlY - baselineY;
  
  // Invert: if it was below baseline (positive), put it above (negative)
  const invertedControlY = baselineY - curveAmount;
  
  // Shift the entire mouth down slightly so it sits at a natural position
  // The frown needs to be lower to look correct (roughly half the curve amount)
  const yOffset = Math.abs(curveAmount) * 0.5;
  
  return `<path 
    class="blobbi-mouth blobbi-mouth-sad"
    d="M ${mouth.startX} ${mouth.startY + yOffset} Q ${mouth.controlX} ${invertedControlY + yOffset} ${mouth.endX} ${mouth.endY + yOffset}" 
    ${mouth.strokeAttrs || 'stroke="#1f2937" stroke-width="2.5"'}
    fill="none" 
    stroke-linecap="round"
  />`;
}

/**
 * Generate tear drop SVG with animation
 * 
 * For 'alternating' mode: creates tears on both eyes but they alternate timing,
 * so only one tear is visible at a time and they switch sides each cycle.
 * 
 * @param eyes - Eye positions detected from SVG
 * @param config - Tear configuration
 * @param seed - Optional seed for deterministic "random" eye selection (e.g., SVG hash or Blobbi ID)
 */
export function generateTears(eyes: EyePosition[], config: TearConfig, seed?: number): string {
  const pause = config.pauseBetween ?? 0;
  const fullCycleDuration = config.duration + pause;
  
  if (config.eye === 'alternating') {
    // Alternating mode: both eyes get tears, but offset timing so they alternate
    // This creates the effect of tears switching sides without render flickering
    return eyes.map((eye, index) => {
      const tearStartY = eye.cy + eye.radius + 2;
      const tearEndY = tearStartY + 30;
      // Offset each eye by half the full cycle + pause, so they alternate
      const delay = index * fullCycleDuration;
      // Total animation cycle includes the tear + pause before next
      const totalCycle = fullCycleDuration * eyes.length;
      
      return `
    <g class="blobbi-tear blobbi-tear-${eye.side}">
      <!-- Tear drop shape - alternates with other eye -->
      <ellipse 
        cx="${eye.cx}" 
        cy="${tearStartY}"
        rx="2.5" 
        ry="4"
        fill="url(#tearGradient)"
        opacity="0"
      >
        <!-- Fall animation -->
        <animate 
          attributeName="cy" 
          values="${tearStartY};${tearEndY};${tearStartY}" 
          keyTimes="0;${config.duration / totalCycle};1"
          dur="${totalCycle}s" 
          begin="${delay}s"
          repeatCount="indefinite"
        />
        <!-- Opacity: visible only during this eye's turn -->
        <animate 
          attributeName="opacity" 
          values="0;0.8;0.8;0;0" 
          keyTimes="0;${0.05 * config.duration / totalCycle};${0.8 * config.duration / totalCycle};${config.duration / totalCycle};1"
          dur="${totalCycle}s" 
          begin="${delay}s"
          repeatCount="indefinite"
        />
      </ellipse>
    </g>`;
    }).join('\n');
  }
  
  // Non-alternating modes
  let targetEyes: EyePosition[];
  
  if (config.eye === 'both') {
    targetEyes = eyes;
  } else if (config.eye === 'random') {
    // Use deterministic selection based on seed (defaults to left eye if no seed)
    const eyeIndex = seed !== undefined ? Math.abs(seed) % eyes.length : 0;
    const selectedEye = eyes[eyeIndex];
    targetEyes = selectedEye ? [selectedEye] : [];
  } else {
    const eye = eyes.find(e => e.side === config.eye);
    targetEyes = eye ? [eye] : [];
  }
  
  return targetEyes.map((eye, index) => {
    const tearStartY = eye.cy + eye.radius + 2;
    const tearEndY = tearStartY + 30;
    const delay = index * (config.duration / 2);
    
    return `
    <g class="blobbi-tear blobbi-tear-${eye.side}">
      <!-- Tear drop shape -->
      <ellipse 
        cx="${eye.cx}" 
        cy="${tearStartY}"
        rx="2.5" 
        ry="4"
        fill="url(#tearGradient)"
        opacity="0"
      >
        <!-- Fade in, fall, fade out animation -->
        <animate 
          attributeName="cy" 
          values="${tearStartY};${tearEndY}" 
          dur="${fullCycleDuration}s" 
          begin="${delay}s"
          repeatCount="indefinite"
        />
        <animate 
          attributeName="opacity" 
          values="0;0.8;0.8;0;0" 
          keyTimes="0;0.05;${0.8 * config.duration / fullCycleDuration};${config.duration / fullCycleDuration};1"
          dur="${fullCycleDuration}s" 
          begin="${delay}s"
          repeatCount="indefinite"
        />
      </ellipse>
    </g>`;
  }).join('\n');
}

/**
 * Generate the blue watery fill SVG element for a single eye.
 */
function generateWaterFillElement(eye: EyePosition): string {
  // Estimate eye white dimensions (eye white is larger than pupil)
  const eyeWhiteRx = eye.radius * 1.35;
  const eyeWhiteRy = eye.radius * 1.65;
  const eyeWhiteCy = eye.cy - eye.radius * 0.15;
  
  // Blue watery fill - sits at BOTTOM of the EYE WHITE
  const waterTop = eyeWhiteCy + eyeWhiteRy * 0.3;
  const waterBottom = eyeWhiteCy + eyeWhiteRy * 0.95;
  const waterWidth = eyeWhiteRx * 0.85;
  
  return `<!-- Blue watery fill for ${eye.side} eye -->
    <path
      class="blobbi-sad-water blobbi-sad-water-${eye.side}"
      d="M ${eye.cx - waterWidth} ${waterTop} 
         Q ${eye.cx - waterWidth} ${waterBottom} ${eye.cx} ${waterBottom}
         Q ${eye.cx + waterWidth} ${waterBottom} ${eye.cx + waterWidth} ${waterTop}
         Z"
      fill="#7dd3fc"
      opacity="0.4"
    >
      <animate 
        attributeName="opacity" 
        values="0.3;0.5;0.3" 
        dur="2s" 
        repeatCount="indefinite"
      />
    </path>`;
}

/**
 * Apply blue watery fill to eyes by inserting it inside the blobbi-blink groups.
 * 
 * The water fill is inserted AFTER the eye white ellipse but BEFORE the blobbi-eye group.
 * This ensures:
 * 1. Water fill appears above eye white but below pupil
 * 2. Water fill participates in blink animation (scales with the blink group)
 * 3. Water fill does NOT track with mouse (stays fixed like eye white)
 */
export function applySadEyeWaterFill(svgText: string, eyes: EyePosition[]): string {
  for (const eye of eyes) {
    // Find the blobbi-blink group for this eye
    // Structure: <g class="blobbi-blink blobbi-blink-left" ...>
    //              <ellipse ... /> <!-- eye white -->
    //              <g class="blobbi-eye ..."> <!-- tracking group -->
    const blinkGroupRegex = new RegExp(
      `(<g[^>]*class="[^"]*blobbi-blink-${eye.side}[^"]*"[^>]*>)` + // Opening blink tag (capture)
      `([\\s\\S]*?)` + // Content before blobbi-eye (capture - eye white is here)
      `(<g[^>]*class="[^"]*blobbi-eye-${eye.side}[^"]*"[^>]*>)`, // Opening blobbi-eye tag (capture)
      'i'
    );
    
    const match = svgText.match(blinkGroupRegex);
    
    if (match && match.index !== undefined) {
      const [fullMatch, blinkOpenTag, contentBetween, eyeOpenTag] = match;
      const waterFill = generateWaterFillElement(eye);
      
      // Insert water fill after eye white (contentBetween) but before blobbi-eye group
      const replacement = `${blinkOpenTag}${contentBetween}${waterFill}\n    ${eyeOpenTag}`;
      svgText = svgText.replace(fullMatch, replacement);
    }
  }
  
  return svgText;
}

/**
 * Generate the sad highlight SVG elements (to be injected into blobbi-eye groups).
 * Returns just the circle elements, not wrapped in a group.
 */
function generateSadHighlightElements(eye: EyePosition): string {
  // UPPER highlight - LARGER, clearly in upper area of pupil
  const upperX = eye.cx - eye.radius * 0.25;
  const upperY = eye.cy - eye.radius * 0.55;
  const upperSize = eye.radius * 0.4;
  
  // LOWER highlight - SMALLER, clearly in lower area of pupil
  const lowerX = eye.cx + eye.radius * 0.15;
  const lowerY = eye.cy + eye.radius * 0.35;
  const lowerSize = eye.radius * 0.25;
  
  return `
      <!-- Sad upper highlight -->
      <circle cx="${upperX}" cy="${upperY}" r="${upperSize}" fill="white" opacity="0.9" class="blobbi-sad-highlight" />
      <!-- Sad lower highlight -->
      <circle cx="${lowerX}" cy="${lowerY}" r="${lowerSize}" fill="white" opacity="0.8" class="blobbi-sad-highlight" />`;
}

/**
 * Apply sad eye modifications to the SVG:
 * 1. Hide original highlights inside blobbi-eye groups
 * 2. Inject sad highlights INTO blobbi-eye groups (so they track with pupil)
 * 
 * This ensures sad highlights move with eye tracking and blink properly.
 */
export function applySadEyeHighlights(svgText: string, eyes: EyePosition[]): string {
  if (import.meta.env.DEV) {
    console.log('[Sad Eyes] Starting applySadEyeHighlights with', eyes.length, 'eyes');
    console.log('[Sad Eyes] SVG contains blobbi-eye:', svgText.includes('blobbi-eye'));
  }
  
  // Process each eye - find blobbi-eye groups and modify them
  for (const eye of eyes) {
    // Find the opening tag of the blobbi-eye group for this side
    // Match pattern: <g ...class="...blobbi-eye-left..."...>
    const openTagRegex = new RegExp(
      `<g[^>]*class="[^"]*blobbi-eye-${eye.side}[^"]*"[^>]*>`,
      'i'
    );
    
    const openMatch = svgText.match(openTagRegex);
    
    if (import.meta.env.DEV) {
      console.log(`[Sad Eyes] Eye ${eye.side}: open tag match =`, !!openMatch);
      if (openMatch) {
        console.log(`[Sad Eyes] Eye ${eye.side}: open tag =`, openMatch[0].substring(0, 80));
      }
    }
    
    if (openMatch && openMatch.index !== undefined) {
      const openTagStart = openMatch.index;
      const openTagEnd = openTagStart + openMatch[0].length;
      
      // Find the matching closing </g> tag
      // The blobbi-eye group should not contain nested <g> tags, 
      // so we can find the first </g> after the content
      const afterOpenTag = svgText.substring(openTagEnd);
      const closeTagIndex = afterOpenTag.indexOf('</g>');
      
      if (closeTagIndex !== -1) {
        const content = afterOpenTag.substring(0, closeTagIndex);
        const absoluteCloseStart = openTagEnd + closeTagIndex;
        
        if (import.meta.env.DEV) {
          console.log(`[Sad Eyes] Eye ${eye.side}: found group content, length =`, content.length);
        }
        
        // Hide original white highlights (small white circles) by adding opacity="0"
        // We need to insert opacity="0" BEFORE the closing /> or >
        const modifiedContent = content.replace(
          /<circle([^>]*fill="white"[^/]*)\s*\/>/gi,
          '<circle$1 opacity="0" />'
        );
        
        // Add sad highlights at the end of the group content
        const sadHighlights = generateSadHighlightElements(eye);
        const newContent = modifiedContent + sadHighlights;
        
        if (import.meta.env.DEV) {
          console.log(`[Sad Eyes] Eye ${eye.side}: injecting sad highlights`);
        }
        
        // Reconstruct the SVG with modified content
        svgText = svgText.substring(0, openTagEnd) + newContent + svgText.substring(absoluteCloseStart);
      }
    } else if (import.meta.env.DEV) {
      console.log(`[Sad Eyes] Eye ${eye.side}: NO MATCH for blobbi-eye-${eye.side}`);
    }
  }
  
  return svgText;
}

// ─── Body Effect Generation ───────────────────────────────────────────────────

/**
 * Detect the body path from the SVG.
 * Looks for the main body path (usually has "Body" in comment or uses body gradient).
 * 
 * Returns the path's d attribute and its bounding box estimate.
 */
interface BodyPathInfo {
  pathD: string;
  minY: number;
  maxY: number;
}

function detectBodyPath(svgText: string): BodyPathInfo | null {
  // Strategy 1: Look for path with body gradient fill
  const bodyGradientMatch = svgText.match(/<path[^>]*d="([^"]+)"[^>]*fill="url\(#[^"]*[Bb]ody[^"]*\)"[^>]*\/>/);
  if (bodyGradientMatch) {
    const pathD = bodyGradientMatch[1];
    const bounds = estimatePathBounds(pathD);
    return { pathD, ...bounds };
  }
  
  // Strategy 2: Look for path after "Main body" comment
  const commentMatch = svgText.match(/<!--[^>]*[Bb]ody[^>]*-->\s*<path[^>]*d="([^"]+)"/);
  if (commentMatch) {
    const pathD = commentMatch[1];
    const bounds = estimatePathBounds(pathD);
    return { pathD, ...bounds };
  }
  
  return null;
}

/**
 * Estimate the bounding box of a path from its d attribute.
 * Simple extraction of Y values from the path data.
 */
function estimatePathBounds(pathD: string): { minY: number; maxY: number } {
  // Extract all numbers from the path
  const numbers = pathD.match(/-?\d+\.?\d*/g)?.map(Number) || [];
  
  // Y values are typically at odd indices in M/Q/L commands, but we can
  // just look for reasonable Y bounds (usually in 0-100 range for blobbi)
  let minY = 100;
  let maxY = 0;
  
  // Simple heuristic: numbers > 5 and < 100 are likely coordinates
  for (let i = 1; i < numbers.length; i += 2) {
    const y = numbers[i];
    if (y !== undefined && y >= 5 && y <= 100) {
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }
  
  // Fallback if we couldn't detect bounds
  if (minY >= maxY) {
    minY = 10;
    maxY = 90;
  }
  
  return { minY, maxY };
}

/**
 * Generate the anger-rise body effect.
 * 
 * Creates a red overlay that animates from the bottom of the body upward,
 * simulating anger "rising" inside the Blobbi.
 * 
 * Uses a clipPath to constrain the effect to the body shape.
 */
function generateAngerRiseEffect(bodyPath: BodyPathInfo, config: BodyEffectConfig): { defs: string; overlay: string } {
  const { pathD, minY, maxY } = bodyPath;
  const bodyHeight = maxY - minY;
  
  // Unique IDs for this effect
  const clipId = 'blobbi-anger-clip';
  const gradientId = 'blobbi-anger-gradient';
  
  // Create a linear gradient that animates from transparent to red (bottom to top)
  // The gradient goes from bottom (100% = red) to top (0% = transparent)
  // We animate the gradient stops to create the "rising" effect
  const defs = `
    <!-- Anger rise effect definitions -->
    <clipPath id="${clipId}">
      <path d="${pathD}" />
    </clipPath>
    <linearGradient id="${gradientId}" x1="0" y1="1" x2="0" y2="0">
      <!-- Bottom stop: red, animates opacity from 0 to 0.5 -->
      <stop offset="0%" stop-color="${config.color}">
        <animate 
          attributeName="stop-opacity" 
          values="0;0.5;0.5" 
          keyTimes="0;0.5;1"
          dur="${config.duration}s" 
          fill="freeze"
        />
      </stop>
      <!-- Middle stop: animates position from 0% to 100% (rising effect) -->
      <stop stop-color="${config.color}">
        <animate 
          attributeName="offset" 
          values="0;1" 
          dur="${config.duration}s" 
          fill="freeze"
        />
        <animate 
          attributeName="stop-opacity" 
          values="0;0.4;0.4" 
          keyTimes="0;0.3;1"
          dur="${config.duration}s" 
          fill="freeze"
        />
      </stop>
      <!-- Top stop: transparent (the "surface" of the rising anger) -->
      <stop stop-color="${config.color}" stop-opacity="0">
        <animate 
          attributeName="offset" 
          values="0;1" 
          dur="${config.duration}s" 
          fill="freeze"
        />
      </stop>
    </linearGradient>`;
  
  // Create the overlay rect that fills the body area, clipped to body shape
  const overlay = `
    <!-- Anger rise overlay -->
    <rect 
      class="blobbi-anger-rise"
      x="0" y="${minY}" 
      width="100" height="${bodyHeight}"
      fill="url(#${gradientId})"
      clip-path="url(#${clipId})"
    />`;
  
  return { defs, overlay };
}

// ─── Animated Eyebrows Generation ─────────────────────────────────────────────

/**
 * Generate CSS animation for bouncing eyebrows.
 * Used by excited and mischievous emotions.
 */
function generateAnimatedEyebrowStyles(config: AnimatedEyebrowsConfig): string {
  const dur = config.bounceDuration;
  const amount = config.bounceAmount;
  
  return `
  <style type="text/css">
    @keyframes eyebrow-bounce {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-${amount}px); }
    }
    
    .blobbi-animated-brows .blobbi-eyebrow {
      animation: eyebrow-bounce ${dur}s ease-in-out infinite;
    }
  </style>`;
}

/**
 * Apply animated eyebrow effect to the SVG.
 */
function applyAnimatedEyebrows(svgText: string, config: AnimatedEyebrowsConfig): string {
  // Add class to SVG root for CSS targeting
  svgText = svgText.replace(/<svg([^>]*)>/, (match, attrs) => {
    if (attrs.includes('class="')) {
      return match.replace(/class="([^"]*)"/, 'class="$1 blobbi-animated-brows"');
    } else if (attrs.includes("class='")) {
      return match.replace(/class='([^']*)'/, "class='$1 blobbi-animated-brows'");
    } else {
      return `<svg${attrs} class="blobbi-animated-brows">`;
    }
  });
  
  // Add animation styles
  const animStyles = generateAnimatedEyebrowStyles(config);
  if (svgText.includes('<defs>')) {
    svgText = svgText.replace('<defs>', '<defs>' + animStyles);
  } else {
    svgText = svgText.replace(/(<svg[^>]*>)/, '$1' + animStyles);
  }
  
  return svgText;
}

// ─── Small Smile Generation ───────────────────────────────────────────────────

/**
 * Generate a smaller/smug smile by scaling the original mouth.
 */
function generateSmallSmile(mouth: MouthPosition, config: SmallSmileConfig): string {
  const scale = config.scale;
  const centerX = (mouth.startX + mouth.endX) / 2;
  const centerY = (mouth.startY + mouth.endY) / 2;
  
  // Scale the mouth coordinates around the center
  const scaledStartX = centerX + (mouth.startX - centerX) * scale;
  const scaledEndX = centerX + (mouth.endX - centerX) * scale;
  const scaledControlY = centerY + (mouth.controlY - centerY) * scale;
  
  return `<path 
    class="blobbi-mouth blobbi-mouth-small"
    d="M ${scaledStartX} ${centerY} Q ${centerX} ${scaledControlY} ${scaledEndX} ${centerY}" 
    ${mouth.strokeAttrs || 'stroke="#1f2937" stroke-width="2.5"'}
    fill="none" 
    stroke-linecap="round"
  />`;
}

// ─── Droopy Mouth Generation ──────────────────────────────────────────────────

/**
 * Generate a droopy/weak mouth for the hungry expression.
 * Similar to sad mouth but with less pronounced curve (softer, more tired feeling).
 * The curve is inverted like sad (frown) but smaller and narrower.
 */
function generateDroopyMouth(mouth: MouthPosition, config: DroopyMouthConfig): string {
  // Calculate the baseline Y (average of start and end Y)
  const baselineY = (mouth.startY + mouth.endY) / 2;
  const centerX = (mouth.startX + mouth.endX) / 2;
  
  // Calculate how much the original control point deviates from baseline
  const curveAmount = mouth.controlY - baselineY;
  
  // Invert the curve (frown) but with reduced intensity
  const invertedControlY = baselineY - (curveAmount * config.curveScale);
  
  // Scale the width (narrower for tired/weak look)
  const halfWidth = ((mouth.endX - mouth.startX) / 2) * config.widthScale;
  const scaledStartX = centerX - halfWidth;
  const scaledEndX = centerX + halfWidth;
  
  // Shift the entire mouth down slightly (less than sad mouth)
  const yOffset = Math.abs(curveAmount) * 0.3;
  
  return `<path 
    class="blobbi-mouth blobbi-mouth-droopy"
    d="M ${scaledStartX} ${baselineY + yOffset} Q ${centerX} ${invertedControlY + yOffset} ${scaledEndX} ${baselineY + yOffset}" 
    ${mouth.strokeAttrs || 'stroke="#1f2937" stroke-width="2.5"'}
    fill="none" 
    stroke-linecap="round"
  />`;
}

// ─── Drool Generation ─────────────────────────────────────────────────────────

/**
 * Generate a drool drop from the corner of the mouth.
 * Creates a small, cute drool droplet with subtle animation.
 */
function generateDrool(mouth: MouthPosition, config: DroolConfig): string {
  const side = config.side || 'right';
  
  // Position at the corner of the mouth
  // Account for the droopy mouth being slightly narrower and lower
  const baselineY = (mouth.startY + mouth.endY) / 2;
  const yOffset = Math.abs(mouth.controlY - baselineY) * 0.3; // Match droopy mouth offset
  
  // Drool starts at the corner of the mouth
  const droolX = side === 'right' 
    ? mouth.endX - 2  // Slightly inside right corner
    : mouth.startX + 2; // Slightly inside left corner
  const droolStartY = baselineY + yOffset + 1; // Just below mouth line
  
  // Drool drop path - a teardrop shape
  const dropSize = 3;
  const dropLength = 6;
  
  return `<g class="blobbi-drool">
    <!-- Drool drop with subtle wobble animation -->
    <path
      d="M ${droolX} ${droolStartY} 
         Q ${droolX - dropSize * 0.3} ${droolStartY + dropLength * 0.4} ${droolX} ${droolStartY + dropLength * 0.6}
         Q ${droolX + dropSize * 0.5} ${droolStartY + dropLength * 0.8} ${droolX} ${droolStartY + dropLength}
         Q ${droolX - dropSize * 0.5} ${droolStartY + dropLength * 0.8} ${droolX} ${droolStartY + dropLength * 0.6}
         Q ${droolX + dropSize * 0.3} ${droolStartY + dropLength * 0.4} ${droolX} ${droolStartY}
         Z"
      fill="url(#droolGradient)"
      opacity="0.85"
    >
      <!-- Subtle wobble animation -->
      <animate
        attributeName="d"
        values="M ${droolX} ${droolStartY} Q ${droolX - dropSize * 0.3} ${droolStartY + dropLength * 0.4} ${droolX} ${droolStartY + dropLength * 0.6} Q ${droolX + dropSize * 0.5} ${droolStartY + dropLength * 0.8} ${droolX} ${droolStartY + dropLength} Q ${droolX - dropSize * 0.5} ${droolStartY + dropLength * 0.8} ${droolX} ${droolStartY + dropLength * 0.6} Q ${droolX + dropSize * 0.3} ${droolStartY + dropLength * 0.4} ${droolX} ${droolStartY} Z;
                M ${droolX} ${droolStartY} Q ${droolX - dropSize * 0.4} ${droolStartY + dropLength * 0.45} ${droolX - 0.3} ${droolStartY + dropLength * 0.65} Q ${droolX + dropSize * 0.4} ${droolStartY + dropLength * 0.85} ${droolX - 0.3} ${droolStartY + dropLength + 0.5} Q ${droolX - dropSize * 0.6} ${droolStartY + dropLength * 0.75} ${droolX - 0.3} ${droolStartY + dropLength * 0.65} Q ${droolX + dropSize * 0.2} ${droolStartY + dropLength * 0.35} ${droolX} ${droolStartY} Z;
                M ${droolX} ${droolStartY} Q ${droolX - dropSize * 0.3} ${droolStartY + dropLength * 0.4} ${droolX} ${droolStartY + dropLength * 0.6} Q ${droolX + dropSize * 0.5} ${droolStartY + dropLength * 0.8} ${droolX} ${droolStartY + dropLength} Q ${droolX - dropSize * 0.5} ${droolStartY + dropLength * 0.8} ${droolX} ${droolStartY + dropLength * 0.6} Q ${droolX + dropSize * 0.3} ${droolStartY + dropLength * 0.4} ${droolX} ${droolStartY} Z"
        dur="2s"
        repeatCount="indefinite"
        calcMode="spline"
        keySplines="0.4 0 0.6 1;0.4 0 0.6 1"
      />
    </path>
    <!-- Small highlight on drool -->
    <ellipse 
      cx="${droolX - 0.5}" 
      cy="${droolStartY + dropLength * 0.3}" 
      rx="0.8" 
      ry="1"
      fill="white"
      opacity="0.6"
    />
  </g>`;
}

// ─── Food Icon Generation ─────────────────────────────────────────────────────

/**
 * Generate a small fork and knife icon above the Blobbi's head.
 * Positioned subtly to the right, above the head.
 */
function generateFoodIcon(config: FoodIconConfig): string {
  // Position above head, slightly to the right
  // For a 100x100 viewBox (baby) or 200x200 (adult), we use relative positions
  const iconX = 68; // Slightly right of center
  const iconY = 8;  // Above the head
  const iconSize = 10;
  
  if (config.type === 'plate') {
    // Plate with utensils (more complex)
    return `<g class="blobbi-food-icon" opacity="0.7">
      <!-- Plate circle -->
      <circle cx="${iconX}" cy="${iconY + 3}" r="${iconSize * 0.5}" fill="none" stroke="#9ca3af" stroke-width="0.8" />
      <!-- Fork (left) -->
      <path d="M ${iconX - 4} ${iconY - 2} L ${iconX - 4} ${iconY + 5}" stroke="#9ca3af" stroke-width="0.8" stroke-linecap="round" />
      <path d="M ${iconX - 5} ${iconY - 2} L ${iconX - 5} ${iconY + 1}" stroke="#9ca3af" stroke-width="0.6" stroke-linecap="round" />
      <path d="M ${iconX - 3} ${iconY - 2} L ${iconX - 3} ${iconY + 1}" stroke="#9ca3af" stroke-width="0.6" stroke-linecap="round" />
      <!-- Knife (right) -->
      <path d="M ${iconX + 4} ${iconY - 2} L ${iconX + 4} ${iconY + 5}" stroke="#9ca3af" stroke-width="0.8" stroke-linecap="round" />
      <path d="M ${iconX + 4} ${iconY - 2} Q ${iconX + 5.5} ${iconY} ${iconX + 4} ${iconY + 2}" fill="none" stroke="#9ca3af" stroke-width="0.6" />
    </g>`;
  }
  
  // Default: Simple fork and knife (utensils)
  return `<g class="blobbi-food-icon" opacity="0.65">
    <!-- Fork (left) - 3 tines -->
    <g transform="translate(${iconX - 5}, ${iconY})">
      <!-- Handle -->
      <path d="M 2 3 L 2 8" stroke="#6b7280" stroke-width="1" stroke-linecap="round" />
      <!-- Tines -->
      <path d="M 0.5 0 L 0.5 3" stroke="#6b7280" stroke-width="0.7" stroke-linecap="round" />
      <path d="M 2 0 L 2 3" stroke="#6b7280" stroke-width="0.7" stroke-linecap="round" />
      <path d="M 3.5 0 L 3.5 3" stroke="#6b7280" stroke-width="0.7" stroke-linecap="round" />
      <!-- Tine connector -->
      <path d="M 0.5 3 L 3.5 3" stroke="#6b7280" stroke-width="0.7" />
    </g>
    <!-- Knife (right) -->
    <g transform="translate(${iconX + 2}, ${iconY})">
      <!-- Blade -->
      <path d="M 0 0 L 0 4 Q 2 3 0 0" fill="#6b7280" />
      <!-- Handle -->
      <path d="M 0 4 L 0 8" stroke="#6b7280" stroke-width="1.2" stroke-linecap="round" />
    </g>
  </g>`;
}

// ─── Big Smile Generation ─────────────────────────────────────────────────────

/**
 * Generate a bigger/wider smile by scaling the original mouth.
 */
function generateBigSmile(mouth: MouthPosition, config: BigSmileConfig): string {
  const centerX = (mouth.startX + mouth.endX) / 2;
  const baselineY = (mouth.startY + mouth.endY) / 2;
  
  // Scale the mouth width
  const halfWidth = (mouth.endX - mouth.startX) / 2;
  const scaledHalfWidth = halfWidth * config.widthScale;
  const scaledStartX = centerX - scaledHalfWidth;
  const scaledEndX = centerX + scaledHalfWidth;
  
  // Scale the curve depth (how far down the smile curves)
  const curveDepth = mouth.controlY - baselineY;
  const scaledCurveDepth = curveDepth * config.curveScale;
  const scaledControlY = baselineY + scaledCurveDepth;
  
  return `<path 
    class="blobbi-mouth blobbi-mouth-big"
    d="M ${scaledStartX} ${baselineY} Q ${centerX} ${scaledControlY} ${scaledEndX} ${baselineY}" 
    ${mouth.strokeAttrs || 'stroke="#1f2937" stroke-width="2.5"'}
    fill="none" 
    stroke-linecap="round"
  />`;
}

// ─── Sleepy Animation Generation ──────────────────────────────────────────────

/**
 * Sleepy "Micro-Sleep" Animation
 * 
 * Creates a cute dozing-off cycle where Blobbi:
 * 1. Starts awake with normal smile, Zzz starts appearing softly
 * 2. Eyes slowly close while mouth transitions: smile → U-shaped sleepy mouth
 * 3. Eyes fully close (completely hidden) with visible curved eyelid lines
 * 4. Zzz fully visible above head
 * 5. Stays asleep briefly (~1 second)
 * 6. Wakes up with quick right-left glance
 * 7. Mouth returns from U-shaped back to smile
 * 8. Cycle repeats
 */

/**
 * Generate CSS animations for the sleepy micro-sleep cycle.
 * 
 * Timeline (8 second cycle):
 * 0-10%:   Awake, eyes open
 * 10-35%:  Getting sleepy, eyes slowly closing
 * 35-50%:  Eyes fully closed, entering sleep
 * 50-62%:  Asleep (hold)
 * 62-75%:  Waking up, eyes opening
 * 75-82%:  Quick glance right
 * 82-90%:  Quick glance left
 * 90-100%: Return to normal, reset
 */
function generateSleepyStyles(config: SleepyAnimationConfig): string {
  const dur = config.cycleDuration;
  
  return `
  <style type="text/css">
    /* Closed eye line visibility - appears when eyes are fully closed, disappears immediately on open */
    @keyframes sleepy-closed-eye {
      0%, 33% { opacity: 0; }
      35%, 62% { opacity: 1; }
      63%, 100% { opacity: 0; }
    }
    
    /* Wake-up glance animation (applied to blobbi-eye groups) */
    @keyframes sleepy-wake-glance {
      0%, 75% { transform: translateX(0); }
      78%, 80% { transform: translateX(2px); }
      83%, 85% { transform: translateX(-2px); }
      88%, 100% { transform: translateX(0); }
    }
    
    /* Zzz fade in/out - starts appearing from the beginning, softly at first */
    @keyframes sleepy-zzz {
      0% { opacity: 0; }
      10% { opacity: 0.2; }
      20% { opacity: 0.4; }
      35%, 60% { opacity: 1; }
      70%, 100% { opacity: 0; }
    }
    
    /* Zzz float up animation - starts floating from the beginning */
    @keyframes sleepy-zzz-float {
      0% { transform: translateY(0); }
      35% { transform: translateY(-4px); }
      60% { transform: translateY(-8px); }
      70%, 100% { transform: translateY(-10px); }
    }
    
    .blobbi-sleepy .blobbi-eye {
      animation: sleepy-wake-glance ${dur}s ease-in-out infinite;
    }
    
    .blobbi-sleepy .blobbi-closed-eye {
      animation: sleepy-closed-eye ${dur}s ease-in-out infinite;
    }
    
    .blobbi-sleepy .blobbi-zzz {
      animation: 
        sleepy-zzz ${dur}s ease-in-out infinite,
        sleepy-zzz-float ${dur}s ease-in-out infinite;
    }
  </style>`;
}

/**
 * Generate animated sleepy mouth that transitions:
 * smile → U-shaped sleepy mouth → smile
 * 
 * Uses SVG SMIL animation on path d attribute for smooth morphing.
 * No intermediate flat line - direct transition to the cute U-shaped mouth.
 */
function generateSleepyMouth(mouth: MouthPosition, config: SleepyAnimationConfig): string {
  const dur = config.cycleDuration;
  
  // Calculate mouth center for U-shaped mouth position
  const centerX = (mouth.startX + mouth.endX) / 2;
  const baselineY = (mouth.startY + mouth.endY) / 2;
  
  // 1. Original smile path
  const smilePath = `M ${mouth.startX} ${mouth.startY} Q ${mouth.controlX} ${mouth.controlY} ${mouth.endX} ${mouth.endY}`;
  
  // 2. U-shaped sleepy mouth (small, cute, rounded)
  const roundRadius = 3;
  const uMouthPath = `M ${centerX - roundRadius} ${baselineY} Q ${centerX - roundRadius} ${baselineY + roundRadius * 1.5} ${centerX} ${baselineY + roundRadius * 1.5} Q ${centerX + roundRadius} ${baselineY + roundRadius * 1.5} ${centerX + roundRadius} ${baselineY}`;
  
  // Intermediate: smile that's starting to close (less wide, transitioning toward U)
  const transitionPath = `M ${centerX - roundRadius * 2} ${baselineY} Q ${centerX} ${mouth.controlY * 0.7 + baselineY * 0.3} ${centerX + roundRadius * 2} ${baselineY}`;
  
  // Timeline - direct smile to U-shaped transition:
  // 0-10%:   smile (awake)
  // 10-25%:  smile → transition (getting sleepy)
  // 25-40%:  transition → U-shaped (falling asleep)
  // 40-62%:  U-shaped (asleep)
  // 62-75%:  U-shaped → transition (waking)
  // 75-90%:  transition → smile
  // 90-100%: smile (awake, glancing)
  
  return `<path 
    class="blobbi-mouth blobbi-mouth-sleepy"
    d="${smilePath}"
    ${mouth.strokeAttrs || 'stroke="#1f2937" stroke-width="2.5"'}
    fill="none" 
    stroke-linecap="round"
  >
    <animate
      attributeName="d"
      values="${smilePath};${smilePath};${transitionPath};${uMouthPath};${uMouthPath};${transitionPath};${smilePath};${smilePath}"
      keyTimes="0;0.10;0.25;0.40;0.62;0.75;0.90;1"
      dur="${dur}s"
      repeatCount="indefinite"
      calcMode="spline"
      keySplines="0.4 0 0.6 1;0.4 0 0.6 1;0.4 0 0.6 1;0.4 0 0.6 1;0.4 0 0.6 1;0.4 0 0.6 1;0.4 0 0.6 1"
    />
  </path>`;
}

/**
 * Generate closed eye lines - curved lines that appear when eyes are fully closed.
 * These sit below the eye center to align with the final closed eyelid position.
 * The curve matches the natural shape of a closed eyelid (following the eye's curvature).
 */
function generateClosedEyeLines(eyes: EyePosition[]): string {
  return eyes.map(eye => {
    // Create a curved line that follows the bottom curvature of the eye
    // Width matches the eye white width for natural look
    const lineWidth = eye.radius * 1.6;
    const startX = eye.cx - lineWidth / 2;
    const endX = eye.cx + lineWidth / 2;
    
    // Curve depth matches the natural curvature of the bottom of an eye
    // More pronounced curve for a natural closed eyelid appearance
    const curveDepth = eye.radius * 0.5;
    
    // Offset the line downward to align with the closed eye position
    // The blink clips ~95% of the eye, so the line should be near the bottom
    const yOffset = eye.radius * 0.75; // Move down by 75% of radius
    const lineY = eye.cy + yOffset;
    
    return `<path
      class="blobbi-closed-eye blobbi-closed-eye-${eye.side}"
      d="M ${startX} ${lineY} Q ${eye.cx} ${lineY + curveDepth} ${endX} ${lineY}"
      stroke="#374151"
      stroke-width="2"
      stroke-linecap="round"
      fill="none"
      opacity="0"
    />`;
  }).join('\n');
}

/**
 * Generate Zzz text above the head.
 * Appears during the sleep portion of the cycle.
 */
function generateSleepyZzz(): string {
  // Position above the typical Blobbi head (around y=5-15 for a 100x100 viewBox)
  return `<g class="blobbi-zzz" opacity="0">
    <text x="70" y="12" font-family="system-ui, sans-serif" font-size="8" font-weight="bold" fill="#6b7280">
      z
    </text>
    <text x="76" y="8" font-family="system-ui, sans-serif" font-size="10" font-weight="bold" fill="#6b7280">
      z
    </text>
    <text x="84" y="3" font-family="system-ui, sans-serif" font-size="12" font-weight="bold" fill="#6b7280">
      z
    </text>
  </g>`;
}

/**
 * Apply the complete sleepy micro-sleep animation to the SVG.
 * 
 * This adds:
 * 1. CSS animations for eye closing, wake-up glance
 * 2. Animated mouth (smile → flat → round → smile)
 * 3. Closed eye curved lines
 * 4. Zzz floating text
 */
/**
 * Generate SMIL animations for clip-path rect to create sleepy eye closing effect.
 * Uses the new clip-path blink system instead of scaleY.
 * 
 * Timeline (matching the original):
 * 0-10%:   Eyes open (clip at full height)
 * 10-35%:  Eyes slowly closing (clip shrinks from top)
 * 35-62%:  Eyes fully closed (clip at minimum)
 * 62-75%:  Eyes opening
 * 75-100%: Eyes open (with wake-up glance via CSS)
 */
function generateSleepyClipAnimations(svgText: string, config: SleepyAnimationConfig): string {
  const dur = config.cycleDuration;
  
  // Find all clip-path rects and add SMIL animations to them
  // Uses EYE_CLASSES.clipRect for the class name
  const clipRectRegex = new RegExp(
    `<rect\\s+class="${EYE_CLASSES.clipRect}"\\s+x="([^"]+)"\\s+y="([^"]+)"\\s+width="([^"]+)"\\s+height="([^"]+)"\\s*/>`,
    'g'
  );
  
  return svgText.replace(clipRectRegex, (match, x, y, width, height) => {
    const baseY = parseFloat(y);
    const fullHeight = parseFloat(height);
    
    // Calculate closed position (95% of height hidden, clip moves down)
    const closedOffset = fullHeight * 0.95;
    const closedY = baseY + closedOffset;
    const closedHeight = fullHeight - closedOffset;
    
    // Timeline keyTimes: open -> closing -> closed -> opening -> open
    // 0%, 10% = open | 35% = closed | 40-62% = closed | 75% = open | 100% = open
    const yValues = `${baseY};${baseY};${closedY};${closedY};${baseY};${baseY}`;
    const heightValues = `${fullHeight};${fullHeight};${closedHeight};${closedHeight};${fullHeight};${fullHeight}`;
    const keyTimes = '0;0.10;0.35;0.62;0.75;1';
    
    return `<rect class="${EYE_CLASSES.clipRect}" x="${x}" y="${y}" width="${width}" height="${height}">
        <animate attributeName="y" values="${yValues}" keyTimes="${keyTimes}" dur="${dur}s" repeatCount="indefinite" calcMode="spline" keySplines="0.4 0 0.6 1;0.4 0 0.6 1;0.4 0 0.6 1;0.4 0 0.6 1;0.4 0 0.6 1" />
        <animate attributeName="height" values="${heightValues}" keyTimes="${keyTimes}" dur="${dur}s" repeatCount="indefinite" calcMode="spline" keySplines="0.4 0 0.6 1;0.4 0 0.6 1;0.4 0 0.6 1;0.4 0 0.6 1;0.4 0 0.6 1" />
      </rect>`;
  });
}

function applySleepyAnimation(svgText: string, eyes: EyePosition[], mouth: MouthDetectionResult | null, config: SleepyAnimationConfig): string {
  // Add 'blobbi-sleepy' class to the SVG root element for CSS targeting
  svgText = svgText.replace(/<svg([^>]*)>/, (match, attrs) => {
    if (attrs.includes('class="')) {
      return match.replace(/class="([^"]*)"/, 'class="$1 blobbi-sleepy"');
    } else if (attrs.includes("class='")) {
      return match.replace(/class='([^']*)'/, "class='$1 blobbi-sleepy'");
    } else {
      return `<svg${attrs} class="blobbi-sleepy">`;
    }
  });
  
  // Add the CSS animations (for closed eye lines, wake-up glance, Zzz)
  const sleepyStyles = generateSleepyStyles(config);
  if (svgText.includes('<defs>')) {
    svgText = svgText.replace('<defs>', '<defs>' + sleepyStyles);
  } else {
    svgText = svgText.replace(/(<svg[^>]*>)/, '$1' + sleepyStyles);
  }
  
  // Add SMIL animations to clip-path rects for eye closing effect
  svgText = generateSleepyClipAnimations(svgText, config);
  
  // Replace mouth with animated sleepy mouth
  if (mouth) {
    const sleepyMouthSvg = generateSleepyMouth(mouth.position, config);
    svgText = replaceMouthSection(svgText, sleepyMouthSvg);
  }
  
  // Generate overlays (closed eye lines + Zzz)
  const closedEyeLines = generateClosedEyeLines(eyes);
  const zzz = generateSleepyZzz();
  
  // Insert overlays before closing </svg> tag
  const sleepyOverlays = `
  <!-- Sleepy overlays -->
  <g class="blobbi-sleepy-overlays">
    ${closedEyeLines}
    ${zzz}
  </g>`;
  
  svgText = svgText.replace('</svg>', sleepyOverlays + '\n</svg>');
  
  return svgText;
}

// ─── Main Emotion Application ─────────────────────────────────────────────────

/**
 * Apply emotion overlays to SVG content.
 * 
 * This function adds emotion-specific elements (eyebrows, modified mouth, tears)
 * without modifying the base SVG structure.
 * 
 * @param svgText - The base SVG content
 * @param emotion - The emotion to apply
 * @param variant - The Blobbi variant (baby/adult) for variant-specific adjustments
 * @param form - Optional adult form for form-specific adjustments (e.g., owli, froggi)
 * @returns Modified SVG with emotion overlays
 */
export function applyEmotion(svgText: string, emotion: BlobbiEmotion, variant: BlobbiVariant = 'adult', form?: string): string {
  if (emotion === 'neutral') {
    return svgText;
  }
  
  const config = EMOTION_CONFIGS[emotion];
  if (!config) {
    return svgText;
  }
  
  const eyes = detectEyePositions(svgText);
  const mouth = detectMouthPosition(svgText);
  
  const overlays: string[] = [];
  
  // Add defs for tear gradient if needed
  if (config.tears?.enabled) {
    const tearDefs = `
    <defs>
      <radialGradient id="tearGradient" cx="0.3" cy="0.3">
        <stop offset="0%" stop-color="#e0f2fe" />
        <stop offset="100%" stop-color="#7dd3fc" />
      </radialGradient>
    </defs>`;
    
    // Insert defs if not already present, or add to existing defs
    if (svgText.includes('<defs>')) {
      svgText = svgText.replace('<defs>', '<defs>' + tearDefs.replace(/<\/?defs>/g, ''));
    } else {
      // Insert after opening svg tag
      svgText = svgText.replace(/(<svg[^>]*>)/, '$1' + tearDefs);
    }
  }
  
  // Generate eyebrows
  if (config.eyebrows && eyes.length > 0) {
    overlays.push(generateEyebrows(eyes, config.eyebrows, variant, form));
  }
  
  // Handle mouth modification
  // Priority: roundMouth > mouthCurve (frown)
  if (config.roundMouth && mouth) {
    // Generate the round "O" mouth SVG
    const roundMouthSvg = generateRoundMouth(mouth.position, config.roundMouth);
    
    // Replace the original mouth section with the round mouth
    svgText = replaceMouthSection(svgText, roundMouthSvg);
  } else if (config.mouthCurve !== undefined && config.mouthCurve < 0 && mouth) {
    // Generate the sad mouth SVG (frown)
    const sadMouthSvg = generateSadMouth(mouth.position);
    
    // Replace the original mouth section with the sad mouth
    // This removes the original mouth entirely - no overlay, no double-mouth
    svgText = replaceMouthSection(svgText, sadMouthSvg);
  }
  
  // Generate sad eye effects (watery eyes with repositioned highlights)
  // Delegated to eye system for consistent behavior
  if (config.pupilModification?.wateryEyes && eyes.length > 0) {
    if (import.meta.env.DEV) {
      console.log('[Sad Eyes] Applying sad eye effects via eye system. Eyes detected:', eyes.length);
      eyes.forEach(e => console.log(`  - ${e.side} eye at (${e.cx}, ${e.cy}) radius=${e.radius}`));
    }
    
    const includeWaterFill = config.pupilModification.includeWaterFill !== false;
    svgText = applySadEyesFromEyeSystem(svgText, { includeWaterFill }, eyes);
  }
  
  // Generate tears
  if (config.tears?.enabled && eyes.length > 0) {
    // Generate a deterministic seed from SVG content for consistent tear eye selection
    const seed = hashString(svgText);
    overlays.push(generateTears(eyes, config.tears, seed));
  }
  
  // Generate body effect (e.g., anger rise)
  if (config.bodyEffect) {
    const bodyPath = detectBodyPath(svgText);
    if (bodyPath) {
      const effect = generateAngerRiseEffect(bodyPath, config.bodyEffect);
      
      // Add defs for the body effect
      if (svgText.includes('<defs>')) {
        svgText = svgText.replace('<defs>', '<defs>' + effect.defs);
      } else {
        svgText = svgText.replace(/(<svg[^>]*>)/, `$1\n  <defs>${effect.defs}\n  </defs>`);
      }
      
      // Add the overlay right after the body path (so it appears on top of body but below other elements)
      // Find the body path and insert the overlay after it
      const bodyPathRegex = /<path[^>]*d="[^"]*"[^>]*fill="url\(#[^"]*[Bb]ody[^"]*\)"[^>]*\/>/;
      const bodyPathMatch = svgText.match(bodyPathRegex);
      if (bodyPathMatch && bodyPathMatch.index !== undefined) {
        const insertPos = bodyPathMatch.index + bodyPathMatch[0].length;
        svgText = svgText.slice(0, insertPos) + effect.overlay + svgText.slice(insertPos);
      }
    }
  }
  
  // Generate sleepy animation (tired blink cycle + mouth animation)
  if (config.sleepyAnimation?.enabled) {
    svgText = applySleepyAnimation(svgText, eyes, mouth, config.sleepyAnimation);
  }
  
  // Generate dizzy effect (spiral eyes)
  // Delegated to eye system for consistent behavior
  if (config.dizzyEffect?.enabled && eyes.length > 0) {
    svgText = applyDizzyEyesFromEyeSystem(
      svgText,
      { rotationDuration: config.dizzyEffect.rotationDuration },
      eyes
    );
  }
  
  // Apply animated eyebrows (bouncing animation for excited/mischievous)
  if (config.animatedEyebrows?.enabled) {
    svgText = applyAnimatedEyebrows(svgText, config.animatedEyebrows);
  }
  
  // Generate small/smug smile (for mischievous)
  if (config.smallSmile && mouth) {
    const smallSmileSvg = generateSmallSmile(mouth.position, config.smallSmile);
    svgText = replaceMouthSection(svgText, smallSmileSvg);
  }
  
  // Generate star eyes (for excited)
  // Delegated to eye system for consistent behavior
  if (config.starEyes?.enabled && eyes.length > 0) {
    svgText = applyStarEyesFromEyeSystem(
      svgText,
      {
        points: config.starEyes.points ?? 5,
        color: config.starEyes.color ?? '#fbbf24',
        scale: config.starEyes.scale ?? 0.9,
      },
      eyes
    );
  }
  
  // Generate big smile (for excited)
  if (config.bigSmile && mouth) {
    const bigSmileSvg = generateBigSmile(mouth.position, config.bigSmile);
    svgText = replaceMouthSection(svgText, bigSmileSvg);
  }
  
  // Generate droopy mouth (for hungry)
  if (config.droopyMouth && mouth) {
    const droopyMouthSvg = generateDroopyMouth(mouth.position, config.droopyMouth);
    svgText = replaceMouthSection(svgText, droopyMouthSvg);
  }
  
  // Generate drool (for hungry)
  if (config.drool?.enabled && mouth) {
    // Add drool gradient to defs
    const droolDefs = `
      <radialGradient id="droolGradient" cx="0.3" cy="0.2">
        <stop offset="0%" stop-color="#f0f9ff" />
        <stop offset="60%" stop-color="#e0f2fe" />
        <stop offset="100%" stop-color="#bae6fd" />
      </radialGradient>`;
    
    if (svgText.includes('<defs>')) {
      svgText = svgText.replace('<defs>', '<defs>' + droolDefs);
    } else {
      svgText = svgText.replace(/(<svg[^>]*>)/, `$1\n  <defs>${droolDefs}\n  </defs>`);
    }
    
    overlays.push(generateDrool(mouth.position, config.drool));
  }
  
  // Generate food icon (for hungry)
  if (config.foodIcon?.enabled) {
    overlays.push(generateFoodIcon(config.foodIcon));
  }
  
  // Insert overlays before closing </svg> tag
  if (overlays.length > 0) {
    const overlayGroup = `
  <!-- Emotion overlays: ${emotion} -->
  <g class="blobbi-emotion blobbi-emotion-${emotion}">
    ${overlays.join('\n    ')}
  </g>`;
    
    svgText = svgText.replace('</svg>', overlayGroup + '\n</svg>');
  }
  
  return svgText;
}

/**
 * Check if an emotion requires special eye handling
 */
export function emotionAffectsEyes(emotion: BlobbiEmotion): boolean {
  const config = EMOTION_CONFIGS[emotion];
  return !!(config?.pupilModification || config?.starEyes?.enabled || config?.dizzyEffect?.enabled);
}
