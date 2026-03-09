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
 */
export function customizeBabySvg(
  svgText: string, 
  customization: BabySvgCustomization,
  isSleeping: boolean = false
): string {
  let modifiedSvg = svgText;

  // Only apply customizations if we have colors
  if (!customization.baseColor && !customization.secondaryColor && !customization.eyeColor) {
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
 * Convenience function to customize baby SVG from a Blobbi instance
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

  return customizeBabySvg(svgText, customization, isSleeping);
}
