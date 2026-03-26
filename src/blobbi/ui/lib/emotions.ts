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
  /** Move main highlight downward (0 = no change, 1 = bottom of pupil) */
  highlightOffsetY: number;
  /** Add secondary highlight for watery effect */
  addWateryHighlight: boolean;
  /** Size of watery highlight relative to pupil (0-1) */
  wateryHighlightSize?: number;
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
  /** Tear falls from which eye ('left' | 'right' | 'random' | 'both') */
  eye: 'left' | 'right' | 'random' | 'both';
  /** Animation duration in seconds */
  duration: number;
}

// ─── Emotion Configurations ───────────────────────────────────────────────────

/**
 * Predefined emotion configurations
 */
export const EMOTION_CONFIGS: Record<BlobbiEmotion, EmotionConfig> = {
  neutral: {
    // No modifications - use base SVG as-is
  },
  sad: {
    pupilModification: {
      highlightOffsetY: 0.6, // Move highlight down
      addWateryHighlight: true,
      wateryHighlightSize: 0.5,
    },
    mouthCurve: -1, // Frown
    eyebrows: {
      angle: 15, // Worried angle
      offsetY: -8,
      strokeWidth: 2,
      color: '#1f2937',
    },
    tears: {
      enabled: true,
      eye: 'random',
      duration: 3,
    },
  },
  happy: {
    mouthCurve: 1.2, // Big smile
    // Could add sparkle eyes, rosy cheeks, etc.
  },
  angry: {
    mouthCurve: -0.5, // Slight frown
    eyebrows: {
      angle: -20, // Angry angle (slanted inward)
      offsetY: -6,
      strokeWidth: 2.5,
      color: '#1f2937',
    },
  },
  surprised: {
    mouthCurve: 0, // O mouth (could be implemented differently)
    // Could add wide eyes
  },
  sleepy: {
    // Half-closed eyes effect handled elsewhere
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
  endX: number;
  centerY: number;
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
    const pupilRegex = /<circle[^>]*fill="(#1f2937|#374151|#1e1b4b|#0891b2)"[^>]*\/>/g;
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
  // Look for path with M...Q curve
  const pathMatch = elements.match(/d="M\s*([\d.]+)\s+([\d.]+)\s*Q\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)"/);
  if (pathMatch) {
    return {
      startX: parseFloat(pathMatch[1]),
      endX: parseFloat(pathMatch[5]),
      centerY: parseFloat(pathMatch[2]),
    };
  }
  return null;
}

/**
 * Fallback: Detect mouth using regex pattern matching
 */
function detectMouthByRegex(svgText: string): MouthDetectionResult | null {
  // Look for smile/mouth path with Q curve
  const mouthRegex = /<path[^>]*d="M\s*([\d.]+)\s+([\d.]+)\s*Q\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)"[^>]*stroke[^>]*\/>/g;
  
  let match;
  while ((match = mouthRegex.exec(svgText)) !== null) {
    const startX = parseFloat(match[1]);
    const startY = parseFloat(match[2]);
    const endX = parseFloat(match[5]);
    
    // Check if this looks like a mouth (horizontal, in lower portion of typical blobbi)
    if (Math.abs(startY - parseFloat(match[6])) < 5 && startY > 40) {
      return {
        position: {
          startX,
          endX,
          centerY: startY,
        },
      };
    }
  }
  
  return null;
}

/**
 * Hide mouth elements in the SVG by adding opacity="0" to mouth paths.
 * This preserves the structure while visually hiding the mouth.
 * 
 * Strategy:
 * 1. Look for paths after <!-- Mouth --> marker
 * 2. Fallback to regex matching for mouth-like paths
 */
function hideMouthElements(svgText: string): string {
  // Try marker-based approach first
  const markerMatch = svgText.match(/<!--\s*Mouth[^>]*-->/i);
  
  if (markerMatch && markerMatch.index !== undefined) {
    // Find all paths after the mouth marker until next section
    const markerEndIndex = markerMatch.index + markerMatch[0].length;
    const beforeMarker = svgText.slice(0, markerEndIndex);
    const afterMarker = svgText.slice(markerEndIndex);
    
    // Find where mouth section ends (next comment or certain elements)
    const nextSectionMatch = afterMarker.match(/(?:<!--(?!\s*Mouth)|<(?:ellipse|g\s|rect)[^>]*(?:id|class)=)/i);
    const mouthSectionEnd = nextSectionMatch?.index ?? afterMarker.length;
    
    const mouthSection = afterMarker.slice(0, mouthSectionEnd);
    const afterMouthSection = afterMarker.slice(mouthSectionEnd);
    
    // Add opacity="0" to all paths in mouth section
    const hiddenMouthSection = mouthSection.replace(
      /(<path\s)/g,
      '$1opacity="0" '
    );
    
    return beforeMarker + hiddenMouthSection + afterMouthSection;
  }
  
  // Fallback: hide mouth paths by regex
  const mouthPathRegex = /(<path[^>]*d="M\s*[\d.]+\s+[\d.]+\s*Q\s*[\d.]+\s+[\d.]+\s+[\d.]+\s+[\d.]+")([^>]*stroke[^>]*)(\/?>)/g;
  return svgText.replace(mouthPathRegex, (match) => {
    // Only hide if not already hidden
    if (match.includes('opacity="0"')) return match;
    return match.replace('stroke=', 'opacity="0" stroke=');
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
 * Generate sad mouth SVG (inverted curve)
 */
export function generateSadMouth(mouth: MouthPosition): string {
  const curveAmount = 8; // How much the curve dips
  const controlY = mouth.centerY + curveAmount; // Control point below for frown
  const centerX = (mouth.startX + mouth.endX) / 2;
  
  return `<path 
    class="blobbi-mouth blobbi-mouth-sad"
    d="M ${mouth.startX} ${mouth.centerY} Q ${centerX} ${controlY} ${mouth.endX} ${mouth.centerY}" 
    stroke="#1f2937" 
    stroke-width="3" 
    fill="none" 
    stroke-linecap="round"
  />`;
}

/**
 * Generate tear drop SVG with animation
 * 
 * @param eyes - Eye positions detected from SVG
 * @param config - Tear configuration
 * @param seed - Optional seed for deterministic "random" eye selection (e.g., SVG hash or Blobbi ID)
 */
export function generateTears(eyes: EyePosition[], config: TearConfig, seed?: number): string {
  // Determine which eye(s) to add tears to
  let targetEyes: EyePosition[];
  
  if (config.eye === 'both') {
    targetEyes = eyes;
  } else if (config.eye === 'random') {
    // Use deterministic selection based on seed (defaults to left eye if no seed)
    // This prevents flickering on re-renders while still allowing variety
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
          dur="${config.duration}s" 
          begin="${delay}s"
          repeatCount="indefinite"
        />
        <animate 
          attributeName="opacity" 
          values="0;0.8;0.8;0" 
          keyTimes="0;0.1;0.8;1"
          dur="${config.duration}s" 
          begin="${delay}s"
          repeatCount="indefinite"
        />
      </ellipse>
    </g>`;
  }).join('\n');
}

/**
 * Generate watery eye highlight modification
 * This creates additional highlights for the sad watery eye effect
 */
export function generateWateryHighlights(eyes: EyePosition[], config: PupilModification): string {
  if (!config.addWateryHighlight) return '';
  
  return eyes.map(eye => {
    // Position the watery highlight at top-left of pupil
    const highlightX = eye.cx - eye.radius * 0.3;
    const highlightY = eye.cy - eye.radius * 0.4;
    const size = eye.radius * (config.wateryHighlightSize ?? 0.5);
    
    return `<circle 
      class="blobbi-watery-highlight blobbi-watery-highlight-${eye.side}"
      cx="${highlightX}" 
      cy="${highlightY}" 
      r="${size}"
      fill="white"
      opacity="0.6"
    />`;
  }).join('\n');
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
  
  // Handle mouth modification
  if (config.mouthCurve !== undefined && config.mouthCurve < 0 && mouth) {
    // Hide original mouth elements
    svgText = hideMouthElements(svgText);
    
    // Add replacement mouth in overlays
    overlays.push(generateSadMouth(mouth.position));
  }
  
  // Generate watery highlights
  if (config.pupilModification && eyes.length > 0) {
    overlays.push(generateWateryHighlights(eyes, config.pupilModification));
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
