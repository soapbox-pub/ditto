/**
 * Body Effects Application
 * 
 * Applies body-level visual effects to Blobbi SVG.
 * Body effects are independent of face emotions — they decorate the body
 * without touching eyes, mouth, or eyebrows.
 * 
 * This is the main entry point for applying body effects to an SVG string.
 */

import type { BodyEffectsSpec, BodyEffectResult } from './types';
import {
  generateDirtMarks,
  generateStinkClouds,
  detectBodyPath,
  generateAngerRise,
} from './generators';

// ─── Main Application Function ────────────────────────────────────────────────

/**
 * Apply body effects to a Blobbi SVG.
 * 
 * Body effects are composable and independent:
 * - Multiple effects can be active simultaneously
 * - Effects never modify face elements (eyes, mouth, eyebrows)
 * - Effects add overlays and/or defs to the SVG
 * 
 * @param svgText - The base SVG content (may already have face emotions applied)
 * @param spec - Which body effects to apply
 * @returns Modified SVG with body effects applied
 * 
 * @example
 * ```ts
 * // Apply dirt effects to any face state
 * let svg = applyEmotion(baseSvg, 'boring', 'adult'); // face
 * svg = applyBodyEffects(svg, { dirtyMarks: { enabled: true }, stinkClouds: { enabled: true } }); // body
 * ```
 */
export function applyBodyEffects(svgText: string, spec: BodyEffectsSpec): string {
  const result = generateBodyEffects(svgText, spec);
  
  // Add defs if any
  if (result.defs.length > 0) {
    const defsContent = result.defs.join('\n');
    if (svgText.includes('<defs>')) {
      svgText = svgText.replace('<defs>', '<defs>' + defsContent);
    } else {
      svgText = svgText.replace(/(<svg[^>]*>)/, `$1\n  <defs>${defsContent}\n  </defs>`);
    }
  }
  
  // Add overlays before </svg>
  if (result.overlays.length > 0) {
    const overlayGroup = `
  <!-- Body effects -->
  <g class="blobbi-body-effects">
    ${result.overlays.join('\n    ')}
  </g>`;
    svgText = svgText.replace('</svg>', overlayGroup + '\n</svg>');
  }
  
  return svgText;
}

// ─── Internal ─────────────────────────────────────────────────────────────────

/**
 * Generate all body effect SVG elements from a spec.
 * Pure function — returns overlay and def strings without mutating anything.
 */
function generateBodyEffects(svgText: string, spec: BodyEffectsSpec): BodyEffectResult {
  const overlays: string[] = [];
  const defs: string[] = [];
  
  // Dirt marks
  if (spec.dirtyMarks?.enabled) {
    const markup = generateDirtMarks(spec.dirtyMarks);
    if (markup) overlays.push(markup);
  }
  
  // Stink clouds
  if (spec.stinkClouds?.enabled) {
    const markup = generateStinkClouds(spec.stinkClouds);
    if (markup) overlays.push(markup);
  }
  
  // Anger rise (needs body path detection)
  if (spec.angerRise) {
    const bodyPathD = detectBodyPath(svgText);
    if (bodyPathD) {
      const result = generateAngerRise(bodyPathD, spec.angerRise);
      defs.push(result.defs);
      overlays.push(result.overlay);
    }
  }
  
  return { overlays, defs };
}
