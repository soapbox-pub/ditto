/**
 * Adult Blobbi SVG Customizer
 * 
 * Handles applying colors and customizations to adult SVG content.
 * Each adult form has different gradient IDs, so we use pattern matching
 * to find and replace the correct gradients.
 */

import type { Blobbi } from '@/types/blobbi';
import type { AdultForm, AdultSvgCustomization } from '../types/adult.types';

// ─── Color Utilities ──────────────────────────────────────────────────────────

/**
 * Lighten a hex color by a percentage
 */
function lightenColor(color: string, percent: number): string {
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
  return color;
}

// ─── Gradient Replacement ─────────────────────────────────────────────────────

/**
 * Build a replacement body gradient with custom colors.
 * Matches the typical 3-stop pattern used in adult SVGs.
 */
function buildBodyGradient(
  gradientId: string, 
  baseColor: string, 
  secondaryColor?: string
): string {
  const highlight = secondaryColor ?? lightenColor(baseColor, 40);
  const mid = secondaryColor ? lightenColor(secondaryColor, 20) : lightenColor(baseColor, 20);
  
  return `<radialGradient id="${gradientId}" cx="0.3" cy="0.2">
      <stop offset="0%" style="stop-color:${highlight};stop-opacity:1" />
      <stop offset="40%" style="stop-color:${mid};stop-opacity:1" />
      <stop offset="100%" style="stop-color:${baseColor};stop-opacity:1" />
    </radialGradient>`;
}

/**
 * Build a replacement pupil gradient with custom eye color.
 */
function buildPupilGradient(gradientId: string, eyeColor: string): string {
  const highlight = lightenColor(eyeColor, 20);
  
  return `<radialGradient id="${gradientId}" cx="0.3" cy="0.3">
      <stop offset="0%" style="stop-color:${highlight};stop-opacity:1" />
      <stop offset="100%" style="stop-color:${eyeColor};stop-opacity:1" />
    </radialGradient>`;
}

// ─── Main Customization ───────────────────────────────────────────────────────

/**
 * Apply color customizations to adult SVG.
 * 
 * Uses pattern matching to find gradients by form name:
 * - Body gradient: {form}Body or {form}Body3D
 * - Pupil gradient: {form}Pupil or {form}Pupil3D
 * 
 * Also handles secondary/accent gradients where applicable.
 */
export function customizeAdultSvg(
  svgText: string,
  form: AdultForm,
  customization: AdultSvgCustomization,
  isSleeping: boolean = false
): string {
  let modifiedSvg = svgText;

  // Ensure SVG fills its container by adding width/height attributes
  // This is needed because the SVG only has viewBox, and without explicit dimensions
  // it may not fill flex containers properly
  modifiedSvg = ensureSvgFillsContainer(modifiedSvg);

  // Skip color customization if no colors provided
  if (!customization.baseColor && !customization.secondaryColor && !customization.eyeColor) {
    return modifiedSvg;
  }

  // Apply body gradient customization
  if (customization.baseColor) {
    modifiedSvg = applyBodyGradient(modifiedSvg, form, customization);
  }

  // Apply eye color customization (skip for sleeping SVGs - eyes are closed)
  if (customization.eyeColor && !isSleeping) {
    modifiedSvg = applyPupilGradient(modifiedSvg, form, customization.eyeColor);
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
 * Apply body gradient customization.
 * Finds and replaces body-related gradients.
 */
function applyBodyGradient(
  svgText: string,
  form: AdultForm,
  customization: AdultSvgCustomization
): string {
  if (!customization.baseColor) return svgText;

  let modified = svgText;

  // Pattern for body gradient: {form}Body or {form}Body3D
  // Case-insensitive match on form name, but preserve actual ID case
  const bodyPatterns = [
    new RegExp(`<radialGradient[^>]*id=["'](${form}Body3D)["'][^>]*>[\\s\\S]*?<\\/radialGradient>`, 'i'),
    new RegExp(`<radialGradient[^>]*id=["'](${form}Body)["'][^>]*>[\\s\\S]*?<\\/radialGradient>`, 'i'),
  ];

  for (const pattern of bodyPatterns) {
    const match = modified.match(pattern);
    if (match) {
      const gradientId = match[1]; // Captured ID preserves original case
      const newGradient = buildBodyGradient(
        gradientId,
        customization.baseColor,
        customization.secondaryColor
      );
      modified = modified.replace(match[0], newGradient);
      break; // Only replace first match
    }
  }

  return modified;
}

/**
 * Apply pupil gradient customization.
 * Finds and replaces eye-related gradients.
 */
function applyPupilGradient(
  svgText: string,
  form: AdultForm,
  eyeColor: string
): string {
  let modified = svgText;

  // Pattern for pupil gradient: {form}Pupil or {form}Pupil3D
  const pupilPatterns = [
    new RegExp(`<radialGradient[^>]*id=["'](${form}Pupil3D)["'][^>]*>[\\s\\S]*?<\\/radialGradient>`, 'i'),
    new RegExp(`<radialGradient[^>]*id=["'](${form}Pupil)["'][^>]*>[\\s\\S]*?<\\/radialGradient>`, 'i'),
  ];

  for (const pattern of pupilPatterns) {
    const match = modified.match(pattern);
    if (match) {
      const gradientId = match[1];
      const newGradient = buildPupilGradient(gradientId, eyeColor);
      modified = modified.replace(match[0], newGradient);
      break;
    }
  }

  return modified;
}

// ─── Convenience Functions ────────────────────────────────────────────────────

/**
 * Convenience function to customize adult SVG from a Blobbi instance.
 */
export function customizeAdultSvgFromBlobbi(
  svgText: string,
  form: AdultForm,
  blobbi: Blobbi,
  isSleeping: boolean = false
): string {
  const customization: AdultSvgCustomization = {
    baseColor: blobbi.baseColor,
    secondaryColor: blobbi.secondaryColor,
    eyeColor: blobbi.eyeColor,
  };

  return customizeAdultSvg(svgText, form, customization, isSleeping);
}
