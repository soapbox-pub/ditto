/**
 * Baby Blobbi SVG Customizer
 * 
 * Handles applying colors and customizations to baby SVG content
 */

import { Blobbi } from '@/types/blobbi';
import { BabySvgCustomization } from '../types/baby.types';

/**
 * Lighten a color by a percentage
 */
function lightenColor(color: string, percent: number): string {
  // Handle hex colors
  if (color.startsWith('#')) {
    const num = parseInt(color.slice(1), 16);
    const amt = Math.round(2.55 * percent);
    const R = (num >> 16) + amt;
    const G = (num >> 8 & 0x00FF) + amt;
    const B = (num & 0x0000FF) + amt;
    return '#' + (
      0x1000000 +
      (R < 255 ? (R < 1 ? 0 : R) : 255) * 0x10000 +
      (G < 255 ? (G < 1 ? 0 : G) : 255) * 0x100 +
      (B < 255 ? (B < 1 ? 0 : B) : 255)
    ).toString(16).slice(1).toUpperCase();
  }
  
  // Return as-is for non-hex colors (rgb, etc.)
  return color;
}

/**
 * Apply color customizations to baby SVG
 * 
 * @param svgText - The SVG content to customize
 * @param customization - Color customization options
 * @param isSleeping - Whether the Blobbi is sleeping (affects eye rendering)
 * @param instanceId - Optional unique ID to prevent gradient ID collisions when multiple Blobbis are rendered
 */
export function customizeBabySvg(
  svgText: string, 
  customization: BabySvgCustomization,
  isSleeping: boolean = false,
  instanceId?: string
): string {
  let modifiedSvg = svgText;

  // Ensure SVG fills its container by adding width/height attributes
  // This is needed because the SVG only has viewBox, and without explicit dimensions
  // it may not fill flex containers properly
  modifiedSvg = ensureSvgFillsContainer(modifiedSvg);

  // Only apply customizations if we have colors
  if (!customization.baseColor && !customization.secondaryColor && !customization.eyeColor) {
    // Still uniquify IDs if instanceId provided (even without color changes)
    if (instanceId) {
      modifiedSvg = uniquifySvgIds(modifiedSvg, instanceId);
    }
    return modifiedSvg;
  }

  // Apply body gradient customization
  if (customization.baseColor) {
    modifiedSvg = applyBodyGradient(modifiedSvg, customization);
  }

  // Apply eye color customization (skip for sleeping SVGs - eyes are closed)
  if (customization.eyeColor && !isSleeping) {
    modifiedSvg = applyEyeColor(modifiedSvg, customization.eyeColor);
  }

  // Make all IDs unique to prevent collisions when multiple Blobbis are rendered
  if (instanceId) {
    modifiedSvg = uniquifySvgIds(modifiedSvg, instanceId);
  }

  return modifiedSvg;
}

/**
 * Ensure SVG has width/height attributes so it fills its container
 */
function ensureSvgFillsContainer(svgText: string): string {
  // Check if width and height are already set
  if (/\swidth=/.test(svgText) && /\sheight=/.test(svgText)) {
    return svgText;
  }

  // Add width="100%" height="100%" to the SVG tag
  return svgText.replace(
    /<svg([^>]*)>/,
    '<svg$1 width="100%" height="100%">'
  );
}

/**
 * Make all SVG definition IDs unique by prefixing with an instance ID.
 * This prevents gradient ID collisions when multiple Blobbis are rendered on the same page.
 * 
 * Updates both:
 * - Definition IDs: id="gradientName" → id="prefix_gradientName"
 * - References: url(#gradientName) → url(#prefix_gradientName)
 */
function uniquifySvgIds(svgText: string, instanceId: string): string {
  // Generate a unique prefix from the full instance ID
  // Sanitize to only allow valid SVG ID characters (letters, numbers, underscore, hyphen)
  // Note: instanceId format is "blobbi-{pubkeyPrefix12}-{petId10}" so we need the full ID
  // to distinguish between Blobbis owned by the same user
  const prefix = `b_${instanceId.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
  
  // Find all IDs defined in the SVG (in defs, gradients, clipPaths, etc.)
  const idPattern = /\bid=["']([^"']+)["']/g;
  const ids = new Set<string>();
  let match;
  
  while ((match = idPattern.exec(svgText)) !== null) {
    ids.add(match[1]);
  }
  
  // Replace each ID and its references
  let modified = svgText;
  for (const id of ids) {
    const prefixedId = `${prefix}_${id}`;
    
    // Replace the ID definition
    modified = modified.replace(
      new RegExp(`\\bid=["']${id}["']`, 'g'),
      `id="${prefixedId}"`
    );
    
    // Replace url() references
    modified = modified.replace(
      new RegExp(`url\\(#${id}\\)`, 'g'),
      `url(#${prefixedId})`
    );
    
    // Replace xlink:href references (older SVG format)
    modified = modified.replace(
      new RegExp(`xlink:href=["']#${id}["']`, 'g'),
      `xlink:href="#${prefixedId}"`
    );
    
    // Replace href references (newer SVG format)
    modified = modified.replace(
      new RegExp(`\\bhref=["']#${id}["']`, 'g'),
      `href="#${prefixedId}"`
    );
  }
  
  return modified;
}

/**
 * Apply body gradient customization
 */
function applyBodyGradient(svgText: string, customization: BabySvgCustomization): string {
  const bodyGradientRegex = /<radialGradient[^>]*id=["']blobbiBodyGradient["'][^>]*>([\s\S]*?)<\/radialGradient>/;
  const bodyGradientMatch = svgText.match(bodyGradientRegex);

  if (!bodyGradientMatch || !customization.baseColor) {
    return svgText;
  }

  let newGradient = '';

  if (customization.secondaryColor) {
    // Both base_color and secondary_color are present
    newGradient = `<radialGradient id="blobbiBodyGradient" cx="0.3" cy="0.25">
      <stop offset="0%" style="stop-color:${customization.secondaryColor}"/>
      <stop offset="60%" style="stop-color:${lightenColor(customization.secondaryColor, 20)}"/>
      <stop offset="100%" style="stop-color:${customization.baseColor}"/>
    </radialGradient>`;
  } else {
    // Only base_color is present
    newGradient = `<radialGradient id="blobbiBodyGradient" cx="0.3" cy="0.25">
      <stop offset="0%" style="stop-color:${lightenColor(customization.baseColor, 40)}"/>
      <stop offset="60%" style="stop-color:${lightenColor(customization.baseColor, 20)}"/>
      <stop offset="100%" style="stop-color:${customization.baseColor}"/>
    </radialGradient>`;
  }

  return svgText.replace(bodyGradientMatch[0], newGradient);
}

/**
 * Apply eye color customization
 */
function applyEyeColor(svgText: string, eyeColor: string): string {
  const eyeGradientRegex = /<radialGradient[^>]*id=["']blobbiPupilGradient["'][^>]*>([\s\S]*?)<\/radialGradient>/;
  const eyeGradientMatch = svgText.match(eyeGradientRegex);

  if (!eyeGradientMatch) {
    return svgText;
  }

  const newEyeGradient = `<radialGradient id="blobbiPupilGradient" cx="0.3" cy="0.3">
    <stop offset="0%" style="stop-color:${lightenColor(eyeColor, 30)}"/>
    <stop offset="100%" style="stop-color:${eyeColor}"/>
  </radialGradient>`;

  return svgText.replace(eyeGradientMatch[0], newEyeGradient);
}

/**
 * Convenience function to customize baby SVG from a Blobbi instance.
 * 
 * Uses the Blobbi's ID to uniquify SVG IDs, preventing gradient collisions
 * when multiple Blobbis are rendered on the same page.
 */
export function customizeBabySvgFromBlobbi(
  svgText: string,
  blobbi: Blobbi,
  isSleeping: boolean = false
): string {
  const customization: BabySvgCustomization = {
    baseColor: blobbi.baseColor,
    secondaryColor: blobbi.secondaryColor,
    eyeColor: blobbi.eyeColor,
  };

  // Pass blobbi.id to uniquify gradient IDs and prevent collisions
  return customizeBabySvg(svgText, customization, isSleeping, blobbi.id);
}
