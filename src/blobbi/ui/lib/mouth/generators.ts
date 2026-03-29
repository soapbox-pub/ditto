/**
 * Mouth Shape Generators
 * 
 * Pure functions that generate SVG markup for different mouth shapes.
 * Each generator takes a MouthPosition and config, returns SVG string.
 */

import type {
  MouthPosition,
  RoundMouthConfig,
  SmallSmileConfig,
  DroopyMouthConfig,
  BigSmileConfig,
  DroolConfig,
  FoodIconConfig,
} from './types';
import { detectMouthPosition, replaceCurrentMouth } from './detection';

// ─── Round Mouth ──────────────────────────────────────────────────────────────

/**
 * Generate round "O" mouth SVG for surprised/curious expressions.
 */
export function generateRoundMouth(mouth: MouthPosition, config: RoundMouthConfig): string {
  const centerX = (mouth.startX + mouth.endX) / 2;
  const centerY = mouth.controlY;
  
  if (config.filled) {
    return `<ellipse 
      class="blobbi-mouth blobbi-mouth-round"
      cx="${centerX}" cy="${centerY}" 
      rx="${config.rx}" ry="${config.ry}"
      fill="#1f2937"
    />`;
  } else {
    return `<ellipse 
      class="blobbi-mouth blobbi-mouth-round"
      cx="${centerX}" cy="${centerY}" 
      rx="${config.rx}" ry="${config.ry}"
      fill="none" stroke="#1f2937" stroke-width="2"
    />`;
  }
}

// ─── Sad Mouth (Frown) ────────────────────────────────────────────────────────

/**
 * Generate sad mouth SVG by inverting the original smile curve.
 */
export function generateSadMouth(mouth: MouthPosition): string {
  const baselineY = (mouth.startY + mouth.endY) / 2;
  const curveAmount = mouth.controlY - baselineY;
  const invertedControlY = baselineY - curveAmount;
  const yOffset = Math.abs(curveAmount) * 0.5;
  
  return `<path 
    class="blobbi-mouth blobbi-mouth-sad"
    d="M ${mouth.startX} ${mouth.startY + yOffset} Q ${mouth.controlX} ${invertedControlY + yOffset} ${mouth.endX} ${mouth.endY + yOffset}" 
    ${mouth.strokeAttrs || 'stroke="#1f2937" stroke-width="2.5"'}
    fill="none" stroke-linecap="round"
  />`;
}

// ─── Small Smile ──────────────────────────────────────────────────────────────

/**
 * Generate a smaller/smug smile by scaling the original mouth.
 */
export function generateSmallSmile(mouth: MouthPosition, config: SmallSmileConfig): string {
  const scale = config.scale;
  const centerX = (mouth.startX + mouth.endX) / 2;
  const centerY = (mouth.startY + mouth.endY) / 2;
  
  const scaledStartX = centerX + (mouth.startX - centerX) * scale;
  const scaledEndX = centerX + (mouth.endX - centerX) * scale;
  const scaledControlY = centerY + (mouth.controlY - centerY) * scale;
  
  return `<path 
    class="blobbi-mouth blobbi-mouth-small"
    d="M ${scaledStartX} ${centerY} Q ${centerX} ${scaledControlY} ${scaledEndX} ${centerY}" 
    ${mouth.strokeAttrs || 'stroke="#1f2937" stroke-width="2.5"'}
    fill="none" stroke-linecap="round"
  />`;
}

// ─── Droopy Mouth ─────────────────────────────────────────────────────────────

/**
 * Generate a droopy/weak mouth.
 * Similar to sad but less pronounced — softer, more tired feeling.
 */
export function generateDroopyMouth(mouth: MouthPosition, config: DroopyMouthConfig): string {
  const baselineY = (mouth.startY + mouth.endY) / 2;
  const centerX = (mouth.startX + mouth.endX) / 2;
  const curveAmount = mouth.controlY - baselineY;
  const invertedControlY = baselineY - (curveAmount * config.curveScale);
  const halfWidth = ((mouth.endX - mouth.startX) / 2) * config.widthScale;
  const scaledStartX = centerX - halfWidth;
  const scaledEndX = centerX + halfWidth;
  const yOffset = Math.abs(curveAmount) * 0.3;
  
  return `<path 
    class="blobbi-mouth blobbi-mouth-droopy"
    d="M ${scaledStartX} ${baselineY + yOffset} Q ${centerX} ${invertedControlY + yOffset} ${scaledEndX} ${baselineY + yOffset}" 
    ${mouth.strokeAttrs || 'stroke="#1f2937" stroke-width="2.5"'}
    fill="none" stroke-linecap="round"
  />`;
}

// ─── Big Smile ────────────────────────────────────────────────────────────────

/**
 * Generate a bigger/wider smile by scaling the original mouth.
 */
export function generateBigSmile(mouth: MouthPosition, config: BigSmileConfig): string {
  const centerX = (mouth.startX + mouth.endX) / 2;
  const baselineY = (mouth.startY + mouth.endY) / 2;
  const halfWidth = (mouth.endX - mouth.startX) / 2;
  const scaledHalfWidth = halfWidth * config.widthScale;
  const scaledStartX = centerX - scaledHalfWidth;
  const scaledEndX = centerX + scaledHalfWidth;
  const curveDepth = mouth.controlY - baselineY;
  const scaledControlY = baselineY + curveDepth * config.curveScale;
  
  return `<path 
    class="blobbi-mouth blobbi-mouth-big"
    d="M ${scaledStartX} ${baselineY} Q ${centerX} ${scaledControlY} ${scaledEndX} ${baselineY}" 
    ${mouth.strokeAttrs || 'stroke="#1f2937" stroke-width="2.5"'}
    fill="none" stroke-linecap="round"
  />`;
}

// ─── Drool ────────────────────────────────────────────────────────────────────

/**
 * Generate a drool drop from the corner of the mouth.
 */
export function generateDrool(mouth: MouthPosition, config: DroolConfig): string {
  const side = config.side || 'right';
  const baselineY = (mouth.startY + mouth.endY) / 2;
  const yOffset = Math.abs(mouth.controlY - baselineY) * 0.3;
  
  const droolX = side === 'right' 
    ? mouth.endX - 2
    : mouth.startX + 2;
  const droolStartY = baselineY + yOffset + 1;
  
  const dropSize = 3;
  const dropLength = 6;
  
  return `<g class="blobbi-drool">
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
    <ellipse 
      cx="${droolX - 0.5}" cy="${droolStartY + dropLength * 0.3}" 
      rx="0.8" ry="1"
      fill="white" opacity="0.6"
    />
  </g>`;
}

// ─── Food Icon ────────────────────────────────────────────────────────────────

/**
 * Generate a small fork and knife icon above the Blobbi's head.
 */
export function generateFoodIcon(config: FoodIconConfig): string {
  const iconX = 68;
  const iconY = 8;
  
  if (config.type === 'plate') {
    return `<g class="blobbi-food-icon" opacity="0.7">
      <circle cx="${iconX}" cy="${iconY + 3}" r="5" fill="none" stroke="#9ca3af" stroke-width="0.8" />
      <path d="M ${iconX - 4} ${iconY - 2} L ${iconX - 4} ${iconY + 5}" stroke="#9ca3af" stroke-width="0.8" stroke-linecap="round" />
      <path d="M ${iconX - 5} ${iconY - 2} L ${iconX - 5} ${iconY + 1}" stroke="#9ca3af" stroke-width="0.6" stroke-linecap="round" />
      <path d="M ${iconX - 3} ${iconY - 2} L ${iconX - 3} ${iconY + 1}" stroke="#9ca3af" stroke-width="0.6" stroke-linecap="round" />
      <path d="M ${iconX + 4} ${iconY - 2} L ${iconX + 4} ${iconY + 5}" stroke="#9ca3af" stroke-width="0.8" stroke-linecap="round" />
      <path d="M ${iconX + 4} ${iconY - 2} Q ${iconX + 5.5} ${iconY} ${iconX + 4} ${iconY + 2}" fill="none" stroke="#9ca3af" stroke-width="0.6" />
    </g>`;
  }
  
  return `<g class="blobbi-food-icon" opacity="0.65">
    <g transform="translate(${iconX - 5}, ${iconY})">
      <path d="M 2 3 L 2 8" stroke="#6b7280" stroke-width="1" stroke-linecap="round" />
      <path d="M 0.5 0 L 0.5 3" stroke="#6b7280" stroke-width="0.7" stroke-linecap="round" />
      <path d="M 2 0 L 2 3" stroke="#6b7280" stroke-width="0.7" stroke-linecap="round" />
      <path d="M 3.5 0 L 3.5 3" stroke="#6b7280" stroke-width="0.7" stroke-linecap="round" />
      <path d="M 0.5 3 L 3.5 3" stroke="#6b7280" stroke-width="0.7" />
    </g>
    <g transform="translate(${iconX + 2}, ${iconY})">
      <path d="M 0 0 L 0 4 Q 2 3 0 0" fill="#6b7280" />
      <path d="M 0 4 L 0 8" stroke="#6b7280" stroke-width="1.2" stroke-linecap="round" />
    </g>
  </g>`;
}

// ─── Sleepy Mouth ─────────────────────────────────────────────────────────────

/**
 * Generate a canonical sleepy mouth: a small round ellipse with a subtle
 * breathing animation (gently expands and contracts).
 * 
 * This is a standalone mouth shape, not a morph of the current mouth.
 * Positioned at the center of the detected mouth location.
 * 
 * @param centerX - Horizontal center of the mouth area
 * @param centerY - Vertical center of the mouth area
 */
export function generateSleepyMouth(centerX: number, centerY: number): string {
  // Small round mouth — like a tiny "o" of gentle breathing
  const rx = 2.8;
  const ry = 3.2;
  
  // Breathing animation: subtle expand/contract cycle
  // Keeps the mouth soft and alive without being distracting
  const breathDuration = 3; // seconds per breath cycle
  const expandRx = rx + 0.5;
  const expandRy = ry + 0.6;
  
  return `<ellipse
    class="blobbi-mouth blobbi-mouth-sleepy"
    cx="${centerX}" cy="${centerY}"
    rx="${rx}" ry="${ry}"
    fill="#1f2937"
  >
    <animate attributeName="rx" values="${rx};${expandRx};${rx}" dur="${breathDuration}s" repeatCount="indefinite" calcMode="spline" keySplines="0.4 0 0.6 1;0.4 0 0.6 1" />
    <animate attributeName="ry" values="${ry};${expandRy};${ry}" dur="${breathDuration}s" repeatCount="indefinite" calcMode="spline" keySplines="0.4 0 0.6 1;0.4 0 0.6 1" />
  </ellipse>`;
}

/**
 * Apply the sleepy mouth to a Blobbi SVG.
 * 
 * Replaces whatever mouth is currently present (smile, frown, round, etc.)
 * with the canonical sleepy breathing mouth. Detects the current mouth
 * position so the sleepy mouth is placed correctly.
 * 
 * @param svgText - SVG content (may already have a base emotion mouth applied)
 * @returns Modified SVG with the sleepy mouth replacing the current mouth
 */
export function applySleepyMouth(svgText: string): string {
  // Detect where the mouth is so we can place the sleepy mouth in the right spot
  const mouth = detectMouthPosition(svgText);
  if (!mouth) {
    return svgText;
  }
  
  const centerX = (mouth.position.startX + mouth.position.endX) / 2;
  const centerY = mouth.position.controlY;
  
  const sleepyMouthSvg = generateSleepyMouth(centerX, centerY);
  return replaceCurrentMouth(svgText, sleepyMouthSvg);
}
