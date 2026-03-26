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
export type BlobbiEmotion = 'neutral' | 'sad' | 'happy' | 'angry' | 'surprised' | 'sleepy';

/**
 * Configuration for emotion visual modifications
 */
export interface EmotionConfig {
  /** Modify pupil highlights for watery/sad eyes */
  pupilModification?: PupilModification;
  /** Override mouth curve (positive = smile, negative = frown) */
  mouthCurve?: number;
  /** Add eyebrows with specified angle */
  eyebrows?: EyebrowConfig;
  /** Add tears animation */
  tears?: TearConfig;
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
  },
  surprised: {
    mouthCurve: 0, // O mouth (could be implemented differently)
  },
  sleepy: {
    mouthCurve: 0,
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
 */
export function generateEyebrows(eyes: EyePosition[], config: EyebrowConfig): string {
  return eyes.map(eye => {
    const browLength = eye.radius * 2;
    const browY = eye.cy + config.offsetY;
    
    // Angle direction: positive rotates outer edge up (worried look)
    // For left eye, rotate around right end; for right eye, rotate around left end
    const angle = eye.side === 'left' ? config.angle : -config.angle;
    
    const startX = eye.cx - browLength / 2;
    const endX = eye.cx + browLength / 2;
    
    return `<path 
      class="blobbi-eyebrow blobbi-eyebrow-${eye.side}"
      d="M ${startX} ${browY} L ${endX} ${browY}" 
      stroke="${config.color}" 
      stroke-width="${config.strokeWidth}" 
      stroke-linecap="round"
      transform="rotate(${angle} ${eye.cx} ${browY})"
    />`;
  }).join('\n');
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
 * Generate the blue watery fill for sad eyes (as overlay on eye white).
 * This stays as an overlay since it's on the eye white, not tracking with pupil.
 */
export function generateSadEyeWaterFill(eyes: EyePosition[]): string {
  return eyes.map(eye => {
    // Estimate eye white dimensions (eye white is larger than pupil)
    const eyeWhiteRx = eye.radius * 1.35;
    const eyeWhiteRy = eye.radius * 1.65;
    const eyeWhiteCy = eye.cy - eye.radius * 0.15;
    
    // Blue watery fill - sits at BOTTOM of the EYE WHITE
    const waterTop = eyeWhiteCy + eyeWhiteRy * 0.3;
    const waterBottom = eyeWhiteCy + eyeWhiteRy * 0.95;
    const waterWidth = eyeWhiteRx * 0.85;
    
    return `
    <!-- Blue watery fill for ${eye.side} eye -->
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
  }).join('\n');
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
  // Process each eye - find blobbi-eye groups and modify them
  for (const eye of eyes) {
    // Find the blobbi-eye group for this side
    const eyeGroupRegex = new RegExp(
      `(<g\\s+class="blobbi-eye\\s+blobbi-eye-${eye.side}"[^>]*>)([\\s\\S]*?)(</g>)`,
      'i'
    );
    
    const match = svgText.match(eyeGroupRegex);
    if (match) {
      const [fullMatch, openTag, content, closeTag] = match;
      
      // Hide original white highlights (small white circles) by adding opacity="0"
      // Original highlights are typically: <circle ... fill="white" ... />
      const modifiedContent = content.replace(
        /(<circle[^>]*fill="white"[^>]*)(\/?>)/gi,
        '$1 opacity="0" $2'
      );
      
      // Add sad highlights at the end of the group content
      const sadHighlights = generateSadHighlightElements(eye);
      const newContent = modifiedContent + sadHighlights;
      
      // Replace in SVG
      svgText = svgText.replace(fullMatch, openTag + newContent + closeTag);
    }
  }
  
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
 * @returns Modified SVG with emotion overlays
 */
export function applyEmotion(svgText: string, emotion: BlobbiEmotion): string {
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
    overlays.push(generateEyebrows(eyes, config.eyebrows));
  }
  
  // Handle mouth modification (sad = frown)
  if (config.mouthCurve !== undefined && config.mouthCurve < 0 && mouth) {
    // Generate the sad mouth SVG
    const sadMouthSvg = generateSadMouth(mouth.position);
    
    // Replace the original mouth section with the sad mouth
    // This removes the original mouth entirely - no overlay, no double-mouth
    svgText = replaceMouthSection(svgText, sadMouthSvg);
  }
  
  // Generate sad eye effects (watery eyes with repositioned highlights)
  if (config.pupilModification?.wateryEyes && eyes.length > 0) {
    // 1. Apply sad highlights INTO the blobbi-eye groups (for tracking/blinking)
    //    This also hides the original highlights
    svgText = applySadEyeHighlights(svgText, eyes);
    
    // 2. Add blue water fill as overlay (on eye white, doesn't need to track)
    overlays.push(generateSadEyeWaterFill(eyes));
  }
  
  // Generate tears
  if (config.tears?.enabled && eyes.length > 0) {
    // Generate a deterministic seed from SVG content for consistent tear eye selection
    const seed = hashString(svgText);
    overlays.push(generateTears(eyes, config.tears, seed));
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
