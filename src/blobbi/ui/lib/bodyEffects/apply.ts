/**
 * Body Effects Application
 * 
 * Applies body-level visual effects to Blobbi SVG.
 * Body effects are independent of face emotions.
 */

import type { BodyEffectsSpec } from './types';
import {
  generateDirtMarks,
  generateDustParticles,
  generateStinkClouds,
  detectBodyPath,
  generateAngerRiseEffect,
} from './generators';

/**
 * Apply body effects to a Blobbi SVG.
 * 
 * This is the single entry point for all body-level visual effects.
 * emotions.ts should delegate to this function rather than calling
 * individual generators directly.
 * 
 * For adult variants, detects body path bounds to enable shape-aware
 * placement of dirt marks and dust particles.
 * 
 * @param svgText - The base SVG content (may already have face emotions applied)
 * @param spec - Which body effects to apply
 * @returns Modified SVG with body effects applied
 */
export function applyBodyEffects(svgText: string, spec: BodyEffectsSpec): string {
  const overlays: string[] = [];
  const defs: string[] = [];
  
  // Generate a unique ID suffix for this application (used by anger-rise)
  // This prevents ID collisions when multiple Blobbis render on the same page
  const idSuffix = spec.idPrefix ?? Math.random().toString(36).slice(2, 8);
  const variant = spec.variant ?? 'adult';
  
  // Detect body path for adult shape-aware placement
  // This enables dirt marks and dust to follow the actual body silhouette
  const bodyPath = variant === 'adult' ? detectBodyPath(svgText) : null;
  
  // Dirt marks + dust particles
  if (spec.dirtyMarks?.enabled) {
    const dirtMarkup = generateDirtMarks({ 
      ...spec.dirtyMarks, 
      variant,
      bodyPath: bodyPath ?? undefined,
    });
    if (dirtMarkup) overlays.push(dirtMarkup);
    
    // Add dust particles (includes both back and front layers)
    const dustMarkup = generateDustParticles({ 
      ...spec.dirtyMarks, 
      variant,
      bodyPath: bodyPath ?? undefined,
    });
    if (dustMarkup) overlays.push(dustMarkup);
  }
  
  // Stink clouds
  if (spec.stinkClouds?.enabled) {
    const markup = generateStinkClouds({ ...spec.stinkClouds, variant });
    if (markup) overlays.push(markup);
  }
  
  // Anger rise (needs body path detection + special insertion)
  // Anger-rise is inserted directly after the body path for correct z-ordering
  if (spec.angerRise) {
    const bodyPathInfo = detectBodyPath(svgText);
    if (bodyPathInfo) {
      const result = generateAngerRiseEffect(
        bodyPathInfo,
        {
          type: 'anger-rise',
          color: spec.angerRise.color,
          duration: spec.angerRise.duration,
          level: spec.angerRise.level,
          bottomOpacity: spec.angerRise.bottomOpacity,
          edgeOpacity: spec.angerRise.edgeOpacity,
        },
        idSuffix,
      );
      defs.push(result.defs);
      
      // Insert anger-rise overlay right after the body element
      // This ensures correct z-ordering (anger fill appears on top of body but under face)
      // Prefer the explicit marker; fall back to legacy path-only gradient regex
      const bodyElRegex = /<(?:path|circle|ellipse|rect)\s[^>]*data-blobbi-body="true"[^>]*\/>/;
      const bodyElFallback = /<path[^>]*d="[^"]*"[^>]*fill="url\(#[^"]*[Bb]ody[^"]*\)"[^>]*\/>/;
      const bodyPathMatch = svgText.match(bodyElRegex) ?? svgText.match(bodyElFallback);
      if (bodyPathMatch && bodyPathMatch.index !== undefined) {
        const insertPos = bodyPathMatch.index + bodyPathMatch[0].length;
        svgText = svgText.slice(0, insertPos) + result.overlay + svgText.slice(insertPos);
      }
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
