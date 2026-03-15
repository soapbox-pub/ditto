/**
 * Centralized validation logic for Blobbi egg properties based on blobbi-egg.md specification
 */

// Base color options from the specification
export const VALID_BASE_COLORS = {
  common: ['#ffffff', '#f2f2f2', '#e6e6ff'],
  uncommon: ['#99ccff', '#ccffcc', '#ffffcc'],
  rare: ['#cc99ff', '#ffb3cc', '#66ffcc'],
  legendary: ['#6633cc', '#ff3399', '#00ffff'],
} as const;

// Alternative base color table from the specification (section)
export const ALTERNATIVE_BASE_COLORS = {
  common: ['#ffffff', '#cccccc', '#ffcc99'],
  uncommon: ['#99ccff', '#ccffcc', '#ffccff'],
  rare: ['#6666ff', '#33cc99', '#ff6699'],
  legendary: ['#9900cc', '#ff0033', '#00ffff'],
} as const;

// Secondary color options from the specification
export const VALID_SECONDARY_COLORS = {
  common: ['#cccccc', '#f0f0f0', '#aabbcc'],
  uncommon: ['#99ccff', '#ccffcc', '#ffcc99'],
  rare: ['#ff99ff', '#9966ff', '#66cccc'],
  legendary: ['#9933ff', '#ff3399', '#00ffcc'],
} as const;

// Size options from the specification
export const VALID_SIZES = {
  common: ['small'],
  uncommon: ['medium'],
  rare: ['large'],
  legendary: ['tiny'],
} as const;

// Pattern options from the specification
export const VALID_PATTERNS = ['gradient', 'solid', 'speckled', 'striped'] as const;

// Egg status options from the specification
export const VALID_EGG_STATUSES = ['cracking', 'warm', 'glowing', 'pulsing'] as const;

// Special mark options from the specification
export const VALID_SPECIAL_MARKS = {
  common: ['dot_center', 'oval_spots'],
  uncommon: ['ring_mark'],
  rare: ['rune_top'],
  legendary: ['sigil_eye'],
} as const;

// Title options from the specification
export const VALID_TITLES = {
  common: ['Hatchling', 'Watcher of the Nest'],
  uncommon: ['Tender of Flames', 'Whisperer'],
  rare: ['Echo of Ancients', 'Shellbound Hero'],
  legendary: ['Defender of the Grove', 'The Primordial'],
} as const;

// Eye color options (generated during hatching)
export const VALID_EYE_COLORS = {
  common: ['#2D3748', '#4A5568', '#1A202C'],
  uncommon: ['#3182CE', '#38A169', '#D69E2E'],
  rare: ['#9F7AEA', '#ED64A6', '#F56565'],
  legendary: ['#00F5FF', '#FFD700', '#FF1493'],
} as const;

// Flattened arrays for easy validation
export const ALL_VALID_BASE_COLORS = [
  ...VALID_BASE_COLORS.common,
  ...VALID_BASE_COLORS.uncommon,
  ...VALID_BASE_COLORS.rare,
  ...VALID_BASE_COLORS.legendary,
  // Include alternative colors as well
  ...ALTERNATIVE_BASE_COLORS.common,
  ...ALTERNATIVE_BASE_COLORS.uncommon,
  ...ALTERNATIVE_BASE_COLORS.rare,
  ...ALTERNATIVE_BASE_COLORS.legendary,
] as const;

export const ALL_VALID_SECONDARY_COLORS = [
  ...VALID_SECONDARY_COLORS.common,
  ...VALID_SECONDARY_COLORS.uncommon,
  ...VALID_SECONDARY_COLORS.rare,
  ...VALID_SECONDARY_COLORS.legendary,
] as const;

export const ALL_VALID_SIZES = [
  ...VALID_SIZES.common,
  ...VALID_SIZES.uncommon,
  ...VALID_SIZES.rare,
  ...VALID_SIZES.legendary,
] as const;

export const ALL_VALID_SPECIAL_MARKS = [
  ...VALID_SPECIAL_MARKS.common,
  ...VALID_SPECIAL_MARKS.uncommon,
  ...VALID_SPECIAL_MARKS.rare,
  ...VALID_SPECIAL_MARKS.legendary,
] as const;

export const ALL_VALID_TITLES = [
  ...VALID_TITLES.common,
  ...VALID_TITLES.uncommon,
  ...VALID_TITLES.rare,
  ...VALID_TITLES.legendary,
] as const;

export const ALL_VALID_EYE_COLORS = [
  ...VALID_EYE_COLORS.common,
  ...VALID_EYE_COLORS.uncommon,
  ...VALID_EYE_COLORS.rare,
  ...VALID_EYE_COLORS.legendary,
] as const;

// Validation functions

/**
 * Validates if a color is a valid CSS hex color.
 * 
 * NOTE: We accept any valid hex color format, not just the hardcoded palette.
 * The palette enforcement happens at the domain level (deriveVisualTraits in blobbi.ts).
 * The EggGraphic module should render whatever valid hex color is provided.
 * 
 * Accepts:
 * - 3-digit hex: #RGB
 * - 6-digit hex: #RRGGBB
 * 
 * Case insensitive.
 */
function isValidHexColor(color: string): boolean {
  return /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(color);
}

/**
 * Validates a base color.
 * Accepts any valid hex color (palette enforcement is at the domain level).
 */
export function isValidBaseColor(color: string): boolean {
  return isValidHexColor(color);
}

/**
 * Validates a secondary color.
 * Accepts any valid hex color (palette enforcement is at the domain level).
 */
export function isValidSecondaryColor(color: string): boolean {
  return isValidHexColor(color);
}

export function isValidSize(size: string): boolean {
  return (ALL_VALID_SIZES as readonly string[]).includes(size);
}

export function isValidPattern(pattern: string): boolean {
  return (VALID_PATTERNS as readonly string[]).includes(pattern);
}

export function isValidEggStatus(status: string): boolean {
  return (VALID_EGG_STATUSES as readonly string[]).includes(status);
}

export function isValidSpecialMark(mark: string): boolean {
  return (ALL_VALID_SPECIAL_MARKS as readonly string[]).includes(mark);
}

export function isValidTitle(title: string): boolean {
  return (ALL_VALID_TITLES as readonly string[]).includes(title);
}

export function isValidEyeColor(color: string): boolean {
  return (ALL_VALID_EYE_COLORS as readonly string[]).includes(color);
}

// Rarity determination functions

/** Rarity levels for egg properties */
type Rarity = 'common' | 'uncommon' | 'rare' | 'legendary';

/**
 * Merged base color palettes for rarity lookup.
 * Combines VALID_BASE_COLORS and ALTERNATIVE_BASE_COLORS by rarity tier.
 */
const MERGED_BASE_COLORS_BY_RARITY: Record<Rarity, readonly string[]> = {
  common: [...VALID_BASE_COLORS.common, ...ALTERNATIVE_BASE_COLORS.common],
  uncommon: [...VALID_BASE_COLORS.uncommon, ...ALTERNATIVE_BASE_COLORS.uncommon],
  rare: [...VALID_BASE_COLORS.rare, ...ALTERNATIVE_BASE_COLORS.rare],
  legendary: [...VALID_BASE_COLORS.legendary, ...ALTERNATIVE_BASE_COLORS.legendary],
};

/**
 * Get the rarity tier of a color from a known palette.
 * Returns null if the color is not in the palette (e.g., custom domain colors).
 * 
 * NOTE: This only works for colors in the legacy specification palettes.
 * Colors from the domain model (BLOBBI_BASE_COLORS in blobbi.ts) will return null.
 */
export function getColorRarity(
  color: string,
  type: 'base' | 'secondary'
): Rarity | null {
  const colorSets = type === 'base' ? MERGED_BASE_COLORS_BY_RARITY : VALID_SECONDARY_COLORS;

  for (const [rarity, colors] of Object.entries(colorSets)) {
    if ((colors as readonly string[]).includes(color)) {
      return rarity as Rarity;
    }
  }
  return null;
}

export function getSizeRarity(size: string): 'common' | 'uncommon' | 'rare' | 'legendary' | null {
  for (const [rarity, sizes] of Object.entries(VALID_SIZES)) {
    if ((sizes as readonly string[]).includes(size)) {
      return rarity as 'common' | 'uncommon' | 'rare' | 'legendary';
    }
  }
  return null;
}

export function getSpecialMarkRarity(
  mark: string
): 'common' | 'uncommon' | 'rare' | 'legendary' | null {
  for (const [rarity, marks] of Object.entries(VALID_SPECIAL_MARKS)) {
    if ((marks as readonly string[]).includes(mark)) {
      return rarity as 'common' | 'uncommon' | 'rare' | 'legendary';
    }
  }
  return null;
}

export function getTitleRarity(
  title: string
): 'common' | 'uncommon' | 'rare' | 'legendary' | null {
  for (const [rarity, titles] of Object.entries(VALID_TITLES)) {
    if ((titles as readonly string[]).includes(title)) {
      return rarity as 'common' | 'uncommon' | 'rare' | 'legendary';
    }
  }
  return null;
}

export function getEyeColorRarity(
  color: string
): 'common' | 'uncommon' | 'rare' | 'legendary' | null {
  for (const [rarity, colors] of Object.entries(VALID_EYE_COLORS)) {
    if ((colors as readonly string[]).includes(color)) {
      return rarity as 'common' | 'uncommon' | 'rare' | 'legendary';
    }
  }
  return null;
}

// Validation for complete egg properties
export interface EggValidationResult {
  isValid: boolean;
  errors: string[];
}

export function validateEggProperties(properties: {
  base_color?: string;
  secondary_color?: string;
  size?: string;
  pattern?: string;
  egg_status?: string;
  special_mark?: string;
  title?: string;
}): EggValidationResult {
  const errors: string[] = [];

  if (properties.base_color && !isValidBaseColor(properties.base_color)) {
    errors.push(
      `Invalid base color: ${properties.base_color}. Must be a valid hex color (e.g., #RRGGBB or #RGB).`
    );
  }

  if (properties.secondary_color && !isValidSecondaryColor(properties.secondary_color)) {
    errors.push(
      `Invalid secondary color: ${properties.secondary_color}. Must be a valid hex color (e.g., #RRGGBB or #RGB).`
    );
  }

  if (properties.size && !isValidSize(properties.size)) {
    errors.push(`Invalid size: ${properties.size}. Must be one of: ${ALL_VALID_SIZES.join(', ')}.`);
  }

  if (properties.pattern && !isValidPattern(properties.pattern)) {
    errors.push(
      `Invalid pattern: ${properties.pattern}. Must be one of: ${VALID_PATTERNS.join(', ')}.`
    );
  }

  if (properties.egg_status && !isValidEggStatus(properties.egg_status)) {
    errors.push(
      `Invalid egg status: ${properties.egg_status}. Must be one of: ${VALID_EGG_STATUSES.join(', ')}.`
    );
  }

  if (properties.special_mark && !isValidSpecialMark(properties.special_mark)) {
    errors.push(
      `Invalid special mark: ${properties.special_mark}. Must be one of: ${ALL_VALID_SPECIAL_MARKS.join(', ')}.`
    );
  }

  if (properties.title && !isValidTitle(properties.title)) {
    errors.push(
      `Invalid title: ${properties.title}. Must be one of: ${ALL_VALID_TITLES.join(', ')}.`
    );
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}
