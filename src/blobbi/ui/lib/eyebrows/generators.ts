/**
 * Eyebrow Generators
 * 
 * Generates eyebrow SVG elements and animation styles.
 * Positions eyebrows relative to detected eye positions.
 */

import type { EyePosition, BlobbiVariant, EyebrowConfig, AnimatedEyebrowsConfig } from './types';

// ─── Eyebrow Generation ───────────────────────────────────────────────────────

/**
 * Generate eyebrow SVG elements.
 * 
 * Structure:
 *   <g transform="rotate(...)">        <!-- handles tilt/inclination -->
 *     <path class="blobbi-eyebrow" />   <!-- CSS animates translateY on this -->
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
  if (variant === 'adult' && form) {
    if (form === 'owli') {
      variantOffsetAdjustment = -12;
    } else if (form === 'froggi') {
      variantOffsetAdjustment = -10;
    }
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

// ─── Animated Eyebrows ────────────────────────────────────────────────────────

/**
 * Generate CSS animation styles for bouncing eyebrows.
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
 * Adds the CSS class and animation styles.
 */
export function applyAnimatedEyebrows(svgText: string, config: AnimatedEyebrowsConfig): string {
  // Add class to SVG root
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
