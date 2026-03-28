/**
 * Adult Blobbi SVG Resolver
 * 
 * Handles loading and resolving adult stage SVG assets.
 * Each adult form has its own folder with base and sleeping variants.
 */

import type { Blobbi } from '@/types/blobbi';
import { 
  type AdultForm, 
  type AdultSvgResolverOptions,
  ADULT_FORMS,
  resolveAdultForm,
  getDefaultAdultForm,
} from '../types/adult.types';
import { ADULT_SVG_MAP } from './adult-svg-data';

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Get adult base SVG content for a specific form
 */
export function getAdultBaseSvg(form: AdultForm): string {
  return ADULT_SVG_MAP[form]?.base ?? getFallbackAdultSvg(form);
}

/**
 * Get adult sleeping SVG content for a specific form
 */
export function getAdultSleepingSvg(form: AdultForm): string {
  return ADULT_SVG_MAP[form]?.sleeping ?? getFallbackAdultSvg(form);
}

/**
 * Get adult SVG by form and variant
 */
export function getAdultSvgByVariant(
  form: AdultForm, 
  variant: 'base' | 'sleeping'
): string {
  return variant === 'sleeping' 
    ? getAdultSleepingSvg(form) 
    : getAdultBaseSvg(form);
}

/**
 * Resolve adult Blobbi SVG content.
 * 
 * Determines the correct form from blobbi data (evolutionForm or seed-derived),
 * then returns the appropriate SVG based on sleeping state.
 */
export function resolveAdultSvg(
  blobbi: Blobbi, 
  options: AdultSvgResolverOptions = {}
): string {
  const { isSleeping = false } = options;
  
  if (blobbi.lifeStage !== 'adult') {
    console.warn('resolveAdultSvg called with non-adult Blobbi');
    return getFallbackAdultSvg(getDefaultAdultForm());
  }
  
  const form = resolveAdultForm(blobbi);
  return isSleeping ? getAdultSleepingSvg(form) : getAdultBaseSvg(form);
}

/**
 * Resolve adult form from Blobbi and return both form and SVG
 */
export function resolveAdultSvgWithForm(
  blobbi: Blobbi,
  options: AdultSvgResolverOptions = {}
): { form: AdultForm; svg: string } {
  const { isSleeping = false } = options;
  const form = resolveAdultForm(blobbi);
  const svg = isSleeping ? getAdultSleepingSvg(form) : getAdultBaseSvg(form);
  return { form, svg };
}

/**
 * Get all available adult forms
 */
export function getAvailableAdultForms(): readonly AdultForm[] {
  return ADULT_FORMS;
}

/**
 * Preload all adult SVGs for quick switching
 */
export function preloadAdultSvgs(): void {
  // All SVGs are inlined constants — this function exists for API consistency
  // This function exists for API consistency
  for (const form of ADULT_FORMS) {
    getAdultBaseSvg(form);
    getAdultSleepingSvg(form);
  }
}

// ─── Fallback ─────────────────────────────────────────────────────────────────

/**
 * Get fallback adult SVG content.
 * Used when the expected asset is not found.
 */
function getFallbackAdultSvg(form: AdultForm): string {
  // Simple placeholder SVG that indicates the form name
  return `
    <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="fallbackAdultGradient" cx="0.3" cy="0.25">
          <stop offset="0%" style="stop-color:#a78bfa"/>
          <stop offset="60%" style="stop-color:#8b5cf6"/>
          <stop offset="100%" style="stop-color:#7c3aed"/>
        </radialGradient>
      </defs>
      <!-- Body -->
      <ellipse cx="100" cy="110" rx="50" ry="60" fill="url(#fallbackAdultGradient)" />
      <!-- Eyes -->
      <ellipse cx="82" cy="95" rx="10" ry="12" fill="#fff" />
      <ellipse cx="118" cy="95" rx="10" ry="12" fill="#fff" />
      <circle cx="82" cy="96" r="7" fill="#374151" />
      <circle cx="118" cy="96" r="7" fill="#374151" />
      <circle cx="84" cy="94" r="2.5" fill="white" />
      <circle cx="120" cy="94" r="2.5" fill="white" />
      <!-- Mouth -->
      <path d="M 88 120 Q 100 130 112 120" stroke="#374151" stroke-width="3" fill="none" stroke-linecap="round" />
      <!-- Form label (dev only) -->
      <text x="100" y="180" text-anchor="middle" font-size="12" fill="#666">${form}</text>
    </svg>
  `;
}
