/**
 * Eyebrow Generators
 * 
 * Generates eyebrow SVG elements and animation styles.
 * Positions eyebrows relative to detected eye positions.
 */

import type { EyePosition, BlobbiVariant, EyebrowConfig, AnimatedEyebrowsConfig } from './types';

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * CSS class names used by the eyebrow system.
 */
export const EYEBROW_CLASSES = {
  /** Wrapper group with rotation transform */
  group: 'blobbi-eyebrow-group',
  /** Left eyebrow group */
  groupLeft: 'blobbi-eyebrow-group-left',
  /** Right eyebrow group */
  groupRight: 'blobbi-eyebrow-group-right',
  /** The eyebrow path element (CSS animates translateY on this) */
  eyebrow: 'blobbi-eyebrow',
  /** Left eyebrow path */
  eyebrowLeft: 'blobbi-eyebrow-left',
  /** Right eyebrow path */
  eyebrowRight: 'blobbi-eyebrow-right',
  /** Applied to SVG root when animated eyebrows are enabled */
  animated: 'blobbi-animated-brows',
  /** Keyframe animation name */
  bounceKeyframe: 'blobbi-eyebrow-bounce',
} as const;

/**
 * Form-specific vertical offset adjustments for adult Blobbi forms.
 * Forms with larger eyes need eyebrows positioned higher.
 */
export const FORM_EYEBROW_OFFSETS: Record<string, number> = {
  owli: -12,
  froggi: -10,
};

// ─── Eyebrow Generation ───────────────────────────────────────────────────────

/**
 * Generate eyebrow SVG elements.
 * 
 * Structure:
 *   <g class="blobbi-eyebrow-group" transform="rotate(...)">
 *     <path class="blobbi-eyebrow" />  <!-- CSS animates translateY on this -->
 *   </g>
 * 
 * @param eyes - Eye positions
 * @param config - Eyebrow configuration
 * @param variant - Blobbi variant for variant-specific adjustments
 * @param form - Optional adult form for form-specific adjustments
 */
export function generateEyebrows(
  eyes: EyePosition[],
  config: EyebrowConfig,
  variant: BlobbiVariant = 'adult',
  form?: string,
): string {
  // Baby-specific adjustment
  let variantOffsetAdjustment = variant === 'baby' ? -2 : 0;
  
  // Form-specific adjustments for adult forms with larger eyes
  if (variant === 'adult' && form && form in FORM_EYEBROW_OFFSETS) {
    variantOffsetAdjustment = FORM_EYEBROW_OFFSETS[form];
  }
  
  return eyes.map(eye => {
    const eyeOverride = eye.side === 'left' ? config.leftEyeOverride : config.rightEyeOverride;
    const effectiveAngle = eyeOverride?.angle ?? config.angle;
    const effectiveOffsetY = eyeOverride?.offsetY ?? config.offsetY;
    const effectiveCurve = eyeOverride?.curve ?? config.curve;
    const effectiveStrokeWidth = eyeOverride?.strokeWidth ?? config.strokeWidth;
    const effectiveColor = eyeOverride?.color ?? config.color;
    
    const browLength = eye.radius * 2;
    const browY = eye.cy + effectiveOffsetY + variantOffsetAdjustment;
    
    // For left eye, rotate one way; for right, mirror
    const angle = eye.side === 'left' ? effectiveAngle : -effectiveAngle;
    
    const startX = eye.cx - browLength / 2;
    const endX = eye.cx + browLength / 2;
    
    let pathD: string;
    if (effectiveCurve && effectiveCurve !== 0) {
      const curveAmount = effectiveCurve * eye.radius;
      const controlX = eye.cx;
      const controlY = browY - curveAmount;
      pathD = `M ${startX} ${browY} Q ${controlX} ${controlY} ${endX} ${browY}`;
    } else {
      pathD = `M ${startX} ${browY} L ${endX} ${browY}`;
    }
    
    const sideClass = eye.side === 'left' ? EYEBROW_CLASSES.groupLeft : EYEBROW_CLASSES.groupRight;
    const eyebrowSideClass = eye.side === 'left' ? EYEBROW_CLASSES.eyebrowLeft : EYEBROW_CLASSES.eyebrowRight;
    
    return `<g class="${EYEBROW_CLASSES.group} ${sideClass}" transform="rotate(${angle} ${eye.cx} ${browY})">
      <path 
        class="${EYEBROW_CLASSES.eyebrow} ${eyebrowSideClass}"
        d="${pathD}" 
        stroke="${effectiveColor}" 
        stroke-width="${effectiveStrokeWidth}" 
        stroke-linecap="round"
        fill="none"
      />
    </g>`;
  }).join('\n');
}

// ─── Animated Eyebrows ────────────────────────────────────────────────────────

/**
 * Generate CSS animation styles for bouncing eyebrows.
 */
function generateAnimatedEyebrowStyles(config: AnimatedEyebrowsConfig): string {
  const dur = config.bounceDuration;
  const amount = config.bounceAmount;
  
  return `
  <style type="text/css">
    @keyframes ${EYEBROW_CLASSES.bounceKeyframe} {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-${amount}px); }
    }
    
    .${EYEBROW_CLASSES.animated} .${EYEBROW_CLASSES.eyebrow} {
      animation: ${EYEBROW_CLASSES.bounceKeyframe} ${dur}s ease-in-out infinite;
    }
  </style>`;
}

/**
 * Apply animated eyebrow effect to the SVG.
 * Adds the CSS class and animation styles.
 */
export function applyAnimatedEyebrows(svgText: string, config: AnimatedEyebrowsConfig): string {
  // Add class to SVG root
  svgText = svgText.replace(/<svg([^>]*)>/, (match, attrs) => {
    if (attrs.includes('class="')) {
      return match.replace(/class="([^"]*)"/, `class="$1 ${EYEBROW_CLASSES.animated}"`);
    } else if (attrs.includes("class='")) {
      return match.replace(/class='([^']*)'/, `class='$1 ${EYEBROW_CLASSES.animated}'`);
    } else {
      return `<svg${attrs} class="${EYEBROW_CLASSES.animated}">`;
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
