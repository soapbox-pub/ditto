/**
 * Adult Blobbi Module Types
 * 
 * Type definitions for adult stage visuals and customization
 */

import type { Blobbi } from '@/types/blobbi';

/**
 * All available adult evolution forms.
 * Each form corresponds to a folder in assets/
 */
export const ADULT_FORMS = [
  'bloomi',
  'breezy',
  'cacti',
  'catti',
  'cloudi',
  'crysti',
  'droppi',
  'flammi',
  'froggi',
  'leafy',
  'mushie',
  'owli',
  'pandi',
  'rocky',
  'rosey',
  'starri',
] as const;

export type AdultForm = typeof ADULT_FORMS[number];

/**
 * Adult visual variant types
 */
export type AdultVariant = 'base' | 'sleeping';

/**
 * Adult SVG customization options
 */
export interface AdultSvgCustomization {
  /** Base body color */
  baseColor?: string;
  /** Secondary body color */
  secondaryColor?: string;
  /** Eye/pupil color */
  eyeColor?: string;
}

/**
 * Adult SVG resolver options
 */
export interface AdultSvgResolverOptions {
  /** Whether the adult is sleeping */
  isSleeping?: boolean;
}

/**
 * Extracts adult-specific customization from a Blobbi
 */
export function extractAdultCustomization(blobbi: Blobbi): AdultSvgCustomization {
  return {
    baseColor: blobbi.baseColor,
    secondaryColor: blobbi.secondaryColor,
    eyeColor: blobbi.eyeColor,
  };
}

/**
 * Validates if a string is a valid adult form
 */
export function isValidAdultForm(form: string): form is AdultForm {
  return ADULT_FORMS.includes(form as AdultForm);
}

/**
 * Gets the default adult form (used as fallback)
 */
export function getDefaultAdultForm(): AdultForm {
  return 'catti';
}

/**
 * Resolves adult form from Blobbi data.
 * Uses adult.evolutionForm if set and valid, otherwise derives from seed.
 */
export function resolveAdultForm(blobbi: Blobbi): AdultForm {
  // Check explicit evolutionForm first
  if (blobbi.adult?.evolutionForm && isValidAdultForm(blobbi.adult.evolutionForm)) {
    return blobbi.adult.evolutionForm;
  }
  
  // Derive from seed if available
  if (blobbi.seed) {
    return deriveAdultFormFromSeed(blobbi.seed);
  }
  
  // Fallback to default
  return getDefaultAdultForm();
}

/**
 * Derives adult form deterministically from a seed string.
 * Uses simple hash-based selection for consistency.
 */
export function deriveAdultFormFromSeed(seed: string): AdultForm {
  // Simple hash: sum of char codes
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  }
  
  // Convert to positive index
  const index = Math.abs(hash) % ADULT_FORMS.length;
  return ADULT_FORMS[index];
}
