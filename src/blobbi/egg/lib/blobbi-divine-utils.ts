/**
 * Divine Blobbi Utilities
 *
 * This module provides centralized utilities for Divine theme detection and tag preservation
 * to ensure consistency across the entire application.
 */

import type { EggVisualBlobbi } from '../types/egg.types';

/**
 * Divine theme constants
 */
export const DIVINE_THEME = 'divine';
export const DIVINE_CROSSOVER_APP = 'divine';
export const DIVINE_BASE_COLOR = '#55C4A2';
export const DIVINE_SPECIAL_MARK = 'divine_wordmark';

/**
 * Creates a tag map from tags array for efficient lookup
 */
export function createTagMap(tags: string[][] = []): Map<string, string> {
  const map = new Map<string, string>();
  tags.forEach(([key, value]) => {
    if (key && value) {
      map.set(key, value);
    }
  });
  return map;
}

/**
 * Robust Divine Blobbi detection
 * Checks both model fields and Nostr tags for comprehensive detection
 */
export function isDivineBlobbi(blobbi: EggVisualBlobbi | null | undefined): boolean {
  if (!blobbi) return false;

  // Check model fields
  if (blobbi.themeVariant === DIVINE_THEME) return true;
  if (blobbi.crossoverApp === DIVINE_CROSSOVER_APP) return true;

  // Check Nostr tags
  const tagMap = createTagMap(blobbi.tags);
  if (tagMap.get('theme') === DIVINE_THEME) return true;
  if (tagMap.get('crossover_app') === DIVINE_CROSSOVER_APP) return true;

  return false;
}

/**
 * Robust Divine egg detection (specialized for egg stage)
 */
export function isDivineEgg(blobbi: EggVisualBlobbi | null | undefined): boolean {
  if (!blobbi || blobbi.lifeStage !== 'egg') return false;
  return isDivineBlobbi(blobbi);
}

/**
 * Ensures Divine tags are present in a Blobbi's tags array
 * If Divine properties exist on the model but tags are missing, adds them
 */
export function ensureDivineTags(blobbi: EggVisualBlobbi): EggVisualBlobbi {
  const isDivine = isDivineBlobbi(blobbi);
  if (!isDivine) return blobbi;

  const tagMap = createTagMap(blobbi.tags || []);
  const hasThemeTag = tagMap.get('theme') === DIVINE_THEME;
  const hasCrossoverTag = tagMap.get('crossover_app') === DIVINE_CROSSOVER_APP;

  // If Divine tags are missing, add them
  if (!hasThemeTag || !hasCrossoverTag) {
    const newTags = [...(blobbi.tags || [])];

    if (!hasThemeTag) {
      newTags.push(['theme', DIVINE_THEME]);
    }

    if (!hasCrossoverTag) {
      newTags.push(['crossover_app', DIVINE_CROSSOVER_APP]);
    }

    return {
      ...blobbi,
      tags: newTags,
    };
  }

  return blobbi;
}

/**
 * Synchronizes Divine model fields with tags
 * Ensures model fields reflect the tag values
 */
export function syncDivineModelFields(blobbi: EggVisualBlobbi): EggVisualBlobbi {
  const tagMap = createTagMap(blobbi.tags || []);
  const themeFromTag = tagMap.get('theme');
  const crossoverFromTag = tagMap.get('crossover_app');

  const hasDivineThemeTag = themeFromTag === DIVINE_THEME;
  const hasDivineCrossoverTag = crossoverFromTag === DIVINE_CROSSOVER_APP;

  // Only update if tags indicate Divine but model fields don't
  if (
    (hasDivineThemeTag || hasDivineCrossoverTag) &&
    !(blobbi.themeVariant === DIVINE_THEME || blobbi.crossoverApp === DIVINE_CROSSOVER_APP)
  ) {
    return {
      ...blobbi,
      themeVariant: hasDivineThemeTag ? DIVINE_THEME : blobbi.themeVariant,
      crossoverApp: hasDivineCrossoverTag ? DIVINE_CROSSOVER_APP : blobbi.crossoverApp,
    };
  }

  return blobbi;
}

/**
 * Ensures Divine properties are properly set when creating a Divine Blobbi
 */
export function createDivineBlobbiProperties(
  overrides: Partial<EggVisualBlobbi> = {}
): Partial<EggVisualBlobbi> {
  return {
    themeVariant: DIVINE_THEME,
    crossoverApp: DIVINE_CROSSOVER_APP,
    baseColor: DIVINE_BASE_COLOR,
    specialMark: DIVINE_SPECIAL_MARK,
    ...overrides,
  };
}

/**
 * Validates that Divine tags and model fields are in sync
 */
export function validateDivineConsistency(
  blobbi: EggVisualBlobbi
): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  const tagMap = createTagMap(blobbi.tags || []);
  const themeFromTag = tagMap.get('theme');
  const crossoverFromTag = tagMap.get('crossover_app');

  // Check consistency between model fields and tags
  if (blobbi.themeVariant === DIVINE_THEME && themeFromTag !== DIVINE_THEME) {
    errors.push('Model has themeVariant="divine" but tag is missing or different');
  }

  if (blobbi.crossoverApp === DIVINE_CROSSOVER_APP && crossoverFromTag !== DIVINE_CROSSOVER_APP) {
    errors.push('Model has crossoverApp="divine" but tag is missing or different');
  }

  if (themeFromTag === DIVINE_THEME && blobbi.themeVariant !== DIVINE_THEME) {
    errors.push('Tag has theme="divine" but model field is missing or different');
  }

  if (crossoverFromTag === DIVINE_CROSSOVER_APP && blobbi.crossoverApp !== DIVINE_CROSSOVER_APP) {
    errors.push('Tag has crossover_app="divine" but model field is missing or different');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}
