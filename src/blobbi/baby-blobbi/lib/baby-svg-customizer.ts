/**
 * Baby Blobbi SVG Customizer
 *
 * Handles applying colors and customizations to baby SVG content.
 * Uses shared utilities from blobbi/ui/lib/svg for common operations.
 */

import { Blobbi } from '@/blobbi/core/types/blobbi';
import { lightenColor, uniquifySvgIds, ensureSvgFillsContainer } from '@/blobbi/ui/lib/svg';
import { BabySvgCustomization } from '../types/baby.types';

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
