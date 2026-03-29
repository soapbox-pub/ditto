/**
 * Body Effects Application
 * 
 * Applies body-level visual effects to Blobbi SVG.
 * Body effects are independent of face emotions.
 */

import type { BodyEffectsSpec } from './types';
import {
  generateDirtMarks,
  generateStinkClouds,
  detectBodyPath,
  generateAngerRiseEffect,
} from './generators';

/**
 * Apply body effects to a Blobbi SVG.
 * 
 * @param svgText - The base SVG content (may already have face emotions applied)
 * @param spec - Which body effects to apply
 * @returns Modified SVG with body effects applied
 */
export function applyBodyEffects(svgText: string, spec: BodyEffectsSpec): string {
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
    const bodyPathInfo = detectBodyPath(svgText);
    if (bodyPathInfo) {
      const result = generateAngerRiseEffect(bodyPathInfo, {
        type: 'anger-rise',
        color: spec.angerRise.color,
        duration: spec.angerRise.duration,
      });
      defs.push(result.defs);
      overlays.push(result.overlay);
    }
  }
  
  // Add defs
  if (defs.length > 0) {
    const defsContent = defs.join('\n');
    if (svgText.includes('<defs>')) {
      svgText = svgText.replace('<defs>', '<defs>' + defsContent);
    } else {
      svgText = svgText.replace(/(<svg[^>]*>)/, `$1\n  <defs>${defsContent}\n  </defs>`);
    }
  }
  
  // Add overlays
  if (overlays.length > 0) {
    const overlayGroup = `
  <!-- Body effects -->
  <g class="blobbi-body-effects">
    ${overlays.join('\n    ')}
  </g>`;
    svgText = svgText.replace('</svg>', overlayGroup + '\n</svg>');
  }
  
  return svgText;
}
