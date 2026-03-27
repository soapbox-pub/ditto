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
 */

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Available emotion states for Blobbies
 */
export type BlobbiEmotion = 'neutral' | 'sad' | 'happy' | 'angry' | 'surprised' | 'sleepy' | 'curious' | 'dizzy' | 'excited' | 'mischievous';

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
}

export interface PupilModification {
  /** Add watery eye effect with repositioned highlights and blue fill */
  wateryEyes: boolean;
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
    // Reuse the same watery eye effect as sad
    pupilModification: {
      wateryEyes: true,
    },
    // Use the same eyebrow config as sad, but with animation
    eyebrows: {
      angle: -15, // Same as sad
      offsetY: -10, // Same as sad
      strokeWidth: 1.5, // Same as sad
      color: '#374151', // Same as sad
    },
    // Animated eyebrows bouncing up and down
    animatedEyebrows: {
      enabled: true,
      bounceDuration: 0.5, // Fast, energetic bounce
      bounceAmount: 3, // Pixels to move up
    },
    // Happy smile (use default or slightly enhanced)
    mouthCurve: 1.2, // Same as happy
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
};

// ─── Eye Position Detection ───────────────────────────────────────────────────

export interface EyePosition {
  cx: number;
  cy: number;
  radius: number;
  side: 'left' | 'right';
}

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
 * Detect eye positions from SVG content
 * Looks for the blobbi-eye groups or falls back to pupil detection
 */
export function detectEyePositions(svgText: string): EyePosition[] {
  const eyes: EyePosition[] = [];

  // First try to find blobbi-eye groups (already processed by eye-animation)
  const eyeGroupRegex = /class="blobbi-eye blobbi-eye-(left|right)"/g;
  let match;

  while ((match = eyeGroupRegex.exec(svgText)) !== null) {
    const side = match[1] as 'left' | 'right';
    
    // Find the pupil circle within this context
    // Look backwards from match to find the data-cx/data-cy on the blink group
    const beforeMatch = svgText.slice(0, match.index);
    const blinkGroupMatch = beforeMatch.match(/data-cx="([\d.]+)" data-cy="([\d.]+)"[^>]*>\s*$/);
    
    if (blinkGroupMatch) {
      const cx = parseFloat(blinkGroupMatch[1]);
      const cy = parseFloat(blinkGroupMatch[2]);
      
      // Estimate radius from nearby pupil circle
      const afterMatch = svgText.slice(match.index, match.index + 200);
      const radiusMatch = afterMatch.match(/r="([\d.]+)"/);
      const radius = radiusMatch ? parseFloat(radiusMatch[1]) : 6;
      
      eyes.push({ cx, cy, radius, side });
    }
  }

  // If no blobbi-eye groups found, fall back to direct pupil detection
  if (eyes.length === 0) {
    // Match circles with dark fill colors OR gradient fills containing "Pupil" in the ID
    // This handles both direct hex colors and gradient references like url(#blobbiPupilGradient)
    const pupilRegex = /<circle[^>]*fill="(#1f2937|#374151|#1e1b4b|#0891b2|url\([^)]*[Pp]upil[^)]*\))"[^>]*\/>/g;
    const pupils: Array<{ cx: number; cy: number; radius: number }> = [];
    
    let pupilMatch;
    while ((pupilMatch = pupilRegex.exec(svgText)) !== null) {
      const cxMatch = pupilMatch[0].match(/cx="([\d.]+)"/);
      const cyMatch = pupilMatch[0].match(/cy="([\d.]+)"/);
      const rMatch = pupilMatch[0].match(/r="([\d.]+)"/);
      
      if (cxMatch && cyMatch && rMatch) {
        pupils.push({
          cx: parseFloat(cxMatch[1]),
          cy: parseFloat(cyMatch[1]),
          radius: parseFloat(rMatch[1]),
        });
      }
    }
    
    // Sort by X to determine left/right
    pupils.sort((a, b) => a.cx - b.cx);
    pupils.forEach((p, i) => {
      eyes.push({
        ...p,
        side: i === 0 ? 'left' : 'right',
      });
    });
  }

  return eyes;
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
 */
export function generateEyebrows(eyes: EyePosition[], config: EyebrowConfig, variant: BlobbiVariant = 'adult'): string {
  // Baby-specific adjustment: move eyebrows slightly farther from eyes
  const variantOffsetAdjustment = variant === 'baby' ? -2 : 0;
  
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

// ─── Dizzy Effect Generation ──────────────────────────────────────────────────

/**
 * Generate spiral eyes for the dizzy effect.
 * These replace the normal eyes with rotating spirals.
 */
function generateDizzySpirals(eyes: EyePosition[], config: DizzyEffectConfig): string {
  const dur = config.rotationDuration;
  
  return eyes.map(eye => {
    // Create a spiral path centered at the eye position
    // The spiral is made of concentric circles that form a spiral pattern
    const spiralSize = eye.radius * 1.2;
    
    // SVG spiral using path - 2 turns of spiral
    const spiralPath = createSpiralPath(eye.cx, eye.cy, spiralSize);
    
    return `<g class="blobbi-dizzy-spiral blobbi-dizzy-spiral-${eye.side}">
      <path
        d="${spiralPath}"
        stroke="#1f2937"
        stroke-width="1.5"
        fill="none"
        stroke-linecap="round"
      >
        <animateTransform
          attributeName="transform"
          type="rotate"
          from="360 ${eye.cx} ${eye.cy}"
          to="0 ${eye.cx} ${eye.cy}"
          dur="${dur}s"
          repeatCount="indefinite"
        />
      </path>
    </g>`;
  }).join('\n');
}

/**
 * Create a spiral path centered at (cx, cy) with given radius.
 */
function createSpiralPath(cx: number, cy: number, radius: number): string {
  // Create a simple 2-turn spiral
  const points: string[] = [];
  const turns = 2;
  const steps = 40;
  
  for (let i = 0; i <= steps; i++) {
    const angle = (i / steps) * turns * 2 * Math.PI;
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

/**
 * Generate CSS styles for dizzy effect.
 * Hides the normal eyes when dizzy spirals are shown.
 */
function generateDizzyStyles(): string {
  return `
  <style type="text/css">
    /* Hide normal eyes when dizzy */
    .blobbi-dizzy .blobbi-blink {
      opacity: 0;
    }
  </style>`;
}

/**
 * Apply dizzy effect to the SVG.
 */
function applyDizzyEffect(svgText: string, eyes: EyePosition[], config: DizzyEffectConfig): string {
  // Add 'blobbi-dizzy' class to SVG root
  svgText = svgText.replace(/<svg([^>]*)>/, (match, attrs) => {
    if (attrs.includes('class="')) {
      return match.replace(/class="([^"]*)"/, 'class="$1 blobbi-dizzy"');
    } else if (attrs.includes("class='")) {
      return match.replace(/class='([^']*)'/, "class='$1 blobbi-dizzy'");
    } else {
      return `<svg${attrs} class="blobbi-dizzy">`;
    }
  });
  
  // Add dizzy styles
  const dizzyStyles = generateDizzyStyles();
  if (svgText.includes('<defs>')) {
    svgText = svgText.replace('<defs>', '<defs>' + dizzyStyles);
  } else {
    svgText = svgText.replace(/(<svg[^>]*>)/, '$1' + dizzyStyles);
  }
  
  // Generate spiral overlays
  const spirals = generateDizzySpirals(eyes, config);
  
  // Insert spirals before closing </svg> tag
  const dizzyOverlay = `
  <!-- Dizzy spiral eyes -->
  <g class="blobbi-dizzy-eyes">
    ${spirals}
  </g>`;
  
  svgText = svgText.replace('</svg>', dizzyOverlay + '\n</svg>');
  
  return svgText;
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
    /* Main eye closing/opening animation */
    /* Eyes fully close to scaleY(0) so original eye is completely hidden */
    @keyframes sleepy-eye-close {
      0%, 10% { transform: scaleY(1); }
      35% { transform: scaleY(0.1); }
      40%, 62% { transform: scaleY(0); }
      75% { transform: scaleY(1); }
      100% { transform: scaleY(1); }
    }
    
    /* Closed eye line visibility - appears when eyes are closing */
    @keyframes sleepy-closed-eye {
      0%, 30% { opacity: 0; }
      38%, 65% { opacity: 1; }
      73%, 100% { opacity: 0; }
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
    
    .blobbi-sleepy .blobbi-blink {
      animation: sleepy-eye-close ${dur}s ease-in-out infinite;
      transform-origin: center;
      transform-box: fill-box;
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
 * These sit at the eye position and look like shut eyelids.
 */
function generateClosedEyeLines(eyes: EyePosition[]): string {
  return eyes.map(eye => {
    // Create a slightly curved line at the eye center
    // The curve is gentle, like a closed eyelid
    const lineWidth = eye.radius * 1.8;
    const startX = eye.cx - lineWidth / 2;
    const endX = eye.cx + lineWidth / 2;
    const curveDepth = eye.radius * 0.3;
    
    return `<path
      class="blobbi-closed-eye blobbi-closed-eye-${eye.side}"
      d="M ${startX} ${eye.cy} Q ${eye.cx} ${eye.cy + curveDepth} ${endX} ${eye.cy}"
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
  
  // Add the CSS animations
  const sleepyStyles = generateSleepyStyles(config);
  if (svgText.includes('<defs>')) {
    svgText = svgText.replace('<defs>', '<defs>' + sleepyStyles);
  } else {
    svgText = svgText.replace(/(<svg[^>]*>)/, '$1' + sleepyStyles);
  }
  
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
 * @returns Modified SVG with emotion overlays
 */
export function applyEmotion(svgText: string, emotion: BlobbiEmotion, variant: BlobbiVariant = 'adult'): string {
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
    overlays.push(generateEyebrows(eyes, config.eyebrows, variant));
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
  if (config.pupilModification?.wateryEyes && eyes.length > 0) {
    if (import.meta.env.DEV) {
      console.log('[Sad Eyes] Applying sad eye effects. Eyes detected:', eyes.length);
      eyes.forEach(e => console.log(`  - ${e.side} eye at (${e.cx}, ${e.cy}) radius=${e.radius}`));
    }
    
    // 1. Apply sad highlights INTO the blobbi-eye groups (for tracking/blinking)
    //    This also hides the original highlights
    svgText = applySadEyeHighlights(svgText, eyes);
    
    // 2. Apply blue water fill INTO blobbi-blink groups (after eye white, before pupil)
    //    This ensures water appears above eye white but below pupil, and blinks with the eye
    svgText = applySadEyeWaterFill(svgText, eyes);
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
  if (config.dizzyEffect?.enabled && eyes.length > 0) {
    svgText = applyDizzyEffect(svgText, eyes, config.dizzyEffect);
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
  return !!(config?.pupilModification);
}
