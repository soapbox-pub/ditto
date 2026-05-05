/**
 * Blobbi Eye System - Effects Module
 *
 * This module provides implementations for all eye-specific effects:
 * - Sad eyes (watery highlights + blue fill)
 * - Star eyes (replace pupils with stars)
 * - Dizzy eyes (spiral overlays)
 * - Sleepy eyes (closing animation)
 *
 * All effects use the injection helpers to ensure proper placement.
 */

import {
  EyePosition,
  SadEyeConfig,
  StarEyeConfig,
  DizzyEyeConfig,
  SleepyEyeConfig,
  EYE_CLASSES,
} from './types';
import { detectEyePositions } from './detection';
import {
  injectIntoEyeTrackLayer,
  injectIntoEyeFixedLayer,
  hideDefaultHighlights,
  addEyeStyles,
  addSvgClass,
  insertOverlay,
  animateClipPathBlink,
} from './injection';
import { detectBodyPath } from '../bodyEffects/generators';
import type { BodyPathInfo } from '../bodyEffects/types';

// ─── Sad Eyes Effect ──────────────────────────────────────────────────────────

/**
 * Apply sad eyes effect to the SVG.
 *
 * This effect:
 * 1. Hides original highlights
 * 2. Adds repositioned "watery" highlights (inside tracking group)
 * 3. Optionally adds blue water fill (inside blink group, fixed)
 *
 * @param svgText - The SVG content
 * @param config - Sad eye configuration
 * @param eyes - Optional pre-detected eye positions
 * @returns Modified SVG
 */
export function applySadEyes(
  svgText: string,
  config: SadEyeConfig = { includeWaterFill: true },
  eyes?: EyePosition[]
): string {
  const detectedEyes = eyes || detectEyePositions(svgText);
  if (detectedEyes.length === 0) return svgText;

  // Apply to each eye
  for (const eye of detectedEyes) {
    // 1. Hide original highlights
    svgText = hideDefaultHighlights(svgText, eye.side);

    // 2. Add sad highlights (track with eye)
    const sadHighlights = generateSadHighlights(eye);
    svgText = injectIntoEyeTrackLayer(svgText, eye.side, sadHighlights);

    // 3. Add water fill if enabled (fixed, doesn't track)
    if (config.includeWaterFill) {
      const waterFill = generateWaterFill(eye);
      svgText = injectIntoEyeFixedLayer(svgText, eye.side, waterFill);
    }
  }

  return svgText;
}

/**
 * Generate sad highlight elements for a single eye.
 */
function generateSadHighlights(eye: EyePosition): string {
  // UPPER highlight - LARGER, in upper area of pupil
  const upperX = eye.cx - eye.radius * 0.25;
  const upperY = eye.cy - eye.radius * 0.55;
  const upperSize = eye.radius * 0.4;

  // LOWER highlight - SMALLER, in lower area of pupil
  const lowerX = eye.cx + eye.radius * 0.15;
  const lowerY = eye.cy + eye.radius * 0.35;
  const lowerSize = eye.radius * 0.25;

  return `<!-- Sad highlights for ${eye.side} eye -->
      <circle cx="${upperX}" cy="${upperY}" r="${upperSize}" fill="white" opacity="0.9" class="${EYE_CLASSES.sadHighlight}" />
      <circle cx="${lowerX}" cy="${lowerY}" r="${lowerSize}" fill="white" opacity="0.8" class="${EYE_CLASSES.sadHighlight}" />`;
}

/**
 * Generate blue watery fill element for a single eye.
 */
function generateWaterFill(eye: EyePosition): string {
  // Estimate eye white dimensions
  const eyeWhiteRx = eye.radius * 1.35;
  const eyeWhiteRy = eye.radius * 1.65;
  const eyeWhiteCy = eye.cy - eye.radius * 0.15;

  // Blue watery fill at BOTTOM of the eye white
  const waterTop = eyeWhiteCy + eyeWhiteRy * 0.3;
  const waterBottom = eyeWhiteCy + eyeWhiteRy * 0.95;
  const waterWidth = eyeWhiteRx * 0.85;

  return `<!-- Blue watery fill for ${eye.side} eye -->
    <path
      class="${EYE_CLASSES.sadWater} ${EYE_CLASSES.sadWater}-${eye.side}"
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

// ─── Star Eyes Effect ─────────────────────────────────────────────────────────

/**
 * Apply star eyes effect to the SVG.
 *
 * This effect:
 * 1. Adds CSS to hide original pupils
 * 2. Injects star elements into tracking groups
 * 3. Adds sparkles around the Blobbi
 *
 * @param svgText - The SVG content
 * @param config - Star eye configuration
 * @param eyes - Optional pre-detected eye positions
 * @returns Modified SVG
 */
export function applyStarEyes(
  svgText: string,
  config: StarEyeConfig = { points: 5, color: '#fbbf24', scale: 0.9 },
  eyes?: EyePosition[]
): string {
  const detectedEyes = eyes || detectEyePositions(svgText);
  if (detectedEyes.length === 0) return svgText;

  // Add class to SVG root for CSS targeting
  svgText = addSvgClass(svgText, 'blobbi-star-eyes');

  // Add styles to hide original pupils
  svgText = addEyeStyles(svgText, `
    /* Hide original pupil circles */
    .blobbi-star-eyes .${EYE_CLASSES.eye} > circle:not(.${EYE_CLASSES.starEye} *),
    .blobbi-star-eyes .${EYE_CLASSES.eye} > circle[fill]:not([fill="white"]) {
      opacity: 0;
    }
    /* Ensure star elements are visible */
    .blobbi-star-eyes .${EYE_CLASSES.starEye} {
      opacity: 1;
    }
  `);

  // Insert stars into each eye's tracking group
  for (const eye of detectedEyes) {
    const starElement = generateStarElement(eye, config);
    svgText = injectIntoEyeTrackLayer(svgText, eye.side, starElement);
  }

  // Detect body geometry for precise sparkle placement.
  // Uses the same detectBodyPath system as body effects (dirt, stink),
  // which reads actual body bounds from data-blobbi-body markers or
  // gradient/comment fallback — no hardcoded viewBox assumptions.
  const bodyPath = detectBodyPath(svgText);

  // Add sparkles distributed around the detected body bounds
  const sparkles = generateSparkles(config.color, bodyPath);
  svgText = insertOverlay(svgText, `
  <!-- Excited sparkles around Blobbi -->
  <g class="blobbi-sparkles-group">
    ${sparkles}
  </g>`);

  return svgText;
}

/**
 * Create a star path for star eyes.
 */
function createStarPath(
  cx: number,
  cy: number,
  outerRadius: number,
  innerRadius: number,
  points: number
): string {
  const pathPoints: string[] = [];
  const angleOffset = -Math.PI / 2; // Start from top

  for (let i = 0; i < points * 2; i++) {
    const angle = angleOffset + (i * Math.PI) / points;
    const radius = i % 2 === 0 ? outerRadius : innerRadius;
    const x = cx + radius * Math.cos(angle);
    const y = cy + radius * Math.sin(angle);

    if (i === 0) {
      pathPoints.push(`M ${x.toFixed(2)} ${y.toFixed(2)}`);
    } else {
      pathPoints.push(`L ${x.toFixed(2)} ${y.toFixed(2)}`);
    }
  }

  pathPoints.push('Z');
  return pathPoints.join(' ');
}

/**
 * Generate a star element for a single eye.
 */
function generateStarElement(eye: EyePosition, config: StarEyeConfig): string {
  const outerRadius = eye.radius * config.scale;
  const innerRadius = outerRadius * 0.4;

  const starPath = createStarPath(eye.cx, eye.cy, outerRadius, innerRadius, config.points);

  return `<g class="${EYE_CLASSES.starEye} ${EYE_CLASSES.starEye}-${eye.side}">
      <path
        d="${starPath}"
        fill="${config.color}"
        stroke="#f59e0b"
        stroke-width="0.5"
      />
      <!-- Small highlight on star -->
      <circle cx="${eye.cx - outerRadius * 0.2}" cy="${eye.cy - outerRadius * 0.3}" r="${outerRadius * 0.15}" fill="white" opacity="0.7" />
    </g>`;
}

/**
 * Generate sparkle elements distributed around the Blobbi body.
 *
 * Uses detected body bounds (from detectBodyPath) to place sparkles in an
 * elliptical ring around the actual body silhouette with a small margin.
 * This works correctly for any viewBox dimension (baby 100x100, adult 200x200,
 * or any other) without hardcoded scale assumptions.
 *
 * Falls back to a centered distribution if body detection fails.
 */
function generateSparkles(color: string, bodyPath: BodyPathInfo | null): string {
  // If body detection succeeded, distribute sparkles around the body bounds.
  // Otherwise fall back to generic center-based placement.
  const cx = bodyPath?.centerX ?? 50;
  const cy = bodyPath ? (bodyPath.minY + bodyPath.height / 2) : 50;
  const radiusX = bodyPath ? (bodyPath.width / 2) * 1.6 : 40;
  const radiusY = bodyPath ? (bodyPath.height / 2) * 1.5 : 42;
  const sparkleSize = bodyPath ? Math.max(2, bodyPath.width * 0.04) : 2.5;

  // Distribute sparkles at fixed angles around an ellipse surrounding the body
  const sparkleAngles = [
    { angle: -90,  sizeMul: 1.0, delay: 0 },      // top center
    { angle: -45,  sizeMul: 0.8, delay: 0.2 },    // top-right
    { angle: -135, sizeMul: 0.85, delay: 0.4 },   // top-left
    { angle: 0,    sizeMul: 0.9, delay: 0.15 },   // right
    { angle: 180,  sizeMul: 0.75, delay: 0.5 },   // left
    { angle: 30,   sizeMul: 0.7, delay: 0.35 },   // lower-right
    { angle: 150,  sizeMul: 0.65, delay: 0.45 },  // lower-left
    { angle: 60,   sizeMul: 0.6, delay: 0.1 },    // mid-right
    { angle: 120,  sizeMul: 0.7, delay: 0.25 },   // mid-left
    { angle: -60,  sizeMul: 0.9, delay: 0.8 },    // upper-right
    { angle: -120, sizeMul: 0.8, delay: 0.6 },    // upper-left
  ];

  return sparkleAngles
    .map(({ angle, sizeMul, delay }) => {
      const rad = (angle * Math.PI) / 180;
      const x = cx + Math.cos(rad) * radiusX;
      const y = cy + Math.sin(rad) * radiusY;
      const size = sparkleSize * sizeMul;
      const duration = 2 + delay * 0.3;
      return createSparkleElement(x, y, size, color, delay, duration);
    })
    .join('\n  ');
}

/**
 * Create a single sparkle element.
 */
function createSparkleElement(
  x: number,
  y: number,
  size: number,
  color: string,
  delay: number,
  duration: number
): string {
  return `<g class="blobbi-sparkle" style="transform-origin: ${x}px ${y}px;">
      <path 
        d="M ${x} ${y - size} L ${x + size * 0.3} ${y} L ${x} ${y + size} L ${x - size * 0.3} ${y} Z M ${x - size} ${y} L ${x} ${y + size * 0.3} L ${x + size} ${y} L ${x} ${y - size * 0.3} Z"
        fill="${color}"
        opacity="0"
      >
        <animate attributeName="opacity" values="0;0.7;0" dur="${duration}s" begin="${delay}s" repeatCount="indefinite" />
      </path>
    </g>`;
}

// ─── Dizzy Eyes Effect ────────────────────────────────────────────────────────

/**
 * Apply dizzy eyes effect to the SVG.
 *
 * This effect:
 * 1. Hides normal eyes via CSS
 * 2. Adds rotating spiral overlays
 *
 * @param svgText - The SVG content
 * @param config - Dizzy eye configuration
 * @param eyes - Optional pre-detected eye positions
 * @returns Modified SVG
 */
export function applyDizzyEyes(
  svgText: string,
  config: DizzyEyeConfig = { rotationDuration: 2 },
  eyes?: EyePosition[]
): string {
  const detectedEyes = eyes || detectEyePositions(svgText);
  if (detectedEyes.length === 0) return svgText;

  // Add class for CSS targeting
  svgText = addSvgClass(svgText, 'blobbi-dizzy');

  // Add styles to hide normal eyes
  svgText = addEyeStyles(svgText, `
    /* Hide normal eyes when dizzy */
    .blobbi-dizzy .${EYE_CLASSES.blink} {
      opacity: 0;
    }
  `);

  // Generate spiral overlays
  const spirals = detectedEyes
    .map((eye) => generateDizzySpiral(eye, config))
    .join('\n');

  // Insert spirals as overlay
  svgText = insertOverlay(svgText, `
  <!-- Dizzy spiral eyes -->
  <g class="blobbi-dizzy-eyes">
    ${spirals}
  </g>`);

  return svgText;
}

/**
 * Generate a spiral element for dizzy effect.
 */
function generateDizzySpiral(eye: EyePosition, config: DizzyEyeConfig): string {
  const spiralSize = eye.radius * 1.2;
  const spiralPath = createSpiralPath(eye.cx, eye.cy, spiralSize);

  return `<g class="${EYE_CLASSES.dizzySpiral} ${EYE_CLASSES.dizzySpiral}-${eye.side}">
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
        dur="${config.rotationDuration}s"
        repeatCount="indefinite"
      />
    </path>
  </g>`;
}

/**
 * Create a spiral path.
 */
function createSpiralPath(cx: number, cy: number, radius: number): string {
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

// ─── Sleepy Eyes Effect ───────────────────────────────────────────────────────

/**
 * Apply sleepy eyes animation to the SVG.
 *
 * This effect:
 * 1. Animates clip-path rects for smooth eye closing
 * 2. Adds CSS for wake-up glance
 * 3. Adds closed eye lines that appear when fully closed
 * 4. Adds Zzz floating text
 *
 * @param svgText - The SVG content
 * @param config - Sleepy eye configuration
 * @param eyes - Optional pre-detected eye positions
 * @returns Modified SVG
 */
export function applySleepyEyes(
  svgText: string,
  config: SleepyEyeConfig = { cycleDuration: 8 },
  eyes?: EyePosition[]
): string {
  const detectedEyes = eyes || detectEyePositions(svgText);
  if (detectedEyes.length === 0) return svgText;

  const dur = config.cycleDuration;

  // Add class for CSS targeting
  svgText = addSvgClass(svgText, 'blobbi-sleepy');

  // Add CSS animations
  svgText = addEyeStyles(svgText, `
    /* Closed eye line visibility */
    @keyframes sleepy-closed-eye {
      0%, 33% { opacity: 0; }
      35%, 62% { opacity: 1; }
      63%, 100% { opacity: 0; }
    }
    
    /* Wake-up glance animation */
    @keyframes sleepy-wake-glance {
      0%, 75% { transform: translateX(0); }
      78%, 80% { transform: translateX(2px); }
      83%, 85% { transform: translateX(-2px); }
      88%, 100% { transform: translateX(0); }
    }
    
    /* Zzz fade in/out */
    @keyframes sleepy-zzz {
      0% { opacity: 0; }
      10% { opacity: 0.2; }
      20% { opacity: 0.4; }
      35%, 60% { opacity: 1; }
      70%, 100% { opacity: 0; }
    }
    
    /* Zzz float up */
    @keyframes sleepy-zzz-float {
      0% { transform: translateY(0); }
      35% { transform: translateY(-4px); }
      60% { transform: translateY(-8px); }
      70%, 100% { transform: translateY(-10px); }
    }
    
    .blobbi-sleepy .${EYE_CLASSES.eye} {
      animation: sleepy-wake-glance ${dur}s ease-in-out infinite;
    }
    
    .blobbi-sleepy .${EYE_CLASSES.closedEye} {
      animation: sleepy-closed-eye ${dur}s ease-in-out infinite;
    }
    
    .blobbi-sleepy .blobbi-zzz {
      animation: 
        sleepy-zzz ${dur}s ease-in-out infinite,
        sleepy-zzz-float ${dur}s ease-in-out infinite;
    }
  `);

  // Animate clip-path rects for eye closing
  // Timeline: open(0-10%) -> closing(10-35%) -> closed(35-62%) -> opening(62-75%) -> open(75-100%)
  svgText = animateClipPathBlink(
    svgText,
    dur,
    [0, 0.10, 0.35, 0.62, 0.75, 1],
    [1, 1, 0.05, 0.05, 1, 1] // open percentages
  );

  // Generate closed eye lines
  const closedEyeLines = detectedEyes
    .map((eye) => generateClosedEyeLine(eye))
    .join('\n');

  // Generate Zzz
  const zzz = generateSleepyZzz();

  // Insert overlays
  svgText = insertOverlay(svgText, `
  <!-- Sleepy overlays -->
  <g class="blobbi-sleepy-overlays">
    ${closedEyeLines}
    ${zzz}
  </g>`);

  return svgText;
}

/**
 * Generate closed eye line for sleepy effect.
 */
function generateClosedEyeLine(eye: EyePosition): string {
  const lineWidth = eye.radius * 1.6;
  const startX = eye.cx - lineWidth / 2;
  const endX = eye.cx + lineWidth / 2;
  const curveDepth = eye.radius * 0.5;
  const yOffset = eye.radius * 0.75;
  const lineY = eye.cy + yOffset;

  return `<path
    class="${EYE_CLASSES.closedEye} ${EYE_CLASSES.closedEye}-${eye.side}"
    d="M ${startX} ${lineY} Q ${eye.cx} ${lineY + curveDepth} ${endX} ${lineY}"
    stroke="#374151"
    stroke-width="2"
    stroke-linecap="round"
    fill="none"
    opacity="0"
  />`;
}

/**
 * Generate Zzz text for sleepy effect.
 */
function generateSleepyZzz(): string {
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

// ─── Utility Exports ──────────────────────────────────────────────────────────

/**
 * Check if an emotion type affects eyes.
 */
export function emotionAffectsEyes(emotion: string): boolean {
  const eyeAffectingEmotions = ['sad', 'excited', 'excitedB', 'dizzy', 'adoring', 'hungry', 'blissful'];
  return eyeAffectingEmotions.includes(emotion);
}
