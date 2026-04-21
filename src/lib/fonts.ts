/**
 * Bundled font registry.
 *
 * Maps font family names to their fontsource dynamic import functions.
 * Fonts are loaded lazily — only imported when actually used.
 */

export type FontCategory = 'sans' | 'serif' | 'mono' | 'display' | 'handwriting';

export interface BundledFont {
  /** Canonical font-family name used in Nostr events and UI display */
  family: string;
  /**
   * The actual CSS font-family name registered by the @fontsource package.
   * For variable fonts, fontsource appends " Variable" to the family name
   * (e.g., "Comfortaa Variable"). For static fonts, this matches `family`.
   */
  cssFamily: string;
  /** Font category for UI grouping */
  category: FontCategory;
  /** Whether this is a variable font (false = static with discrete weights) */
  variable: boolean;
  /** Dynamic import that loads the font CSS into the page */
  load: () => Promise<void>;
  /** Fontsource CDN URL for .woff2 file (used when publishing to Nostr events) */
  cdnUrl: string;
}

/**
 * The 10 curated bundled fonts.
 * Inter is already loaded globally via main.tsx, but included here for completeness.
 */
export const bundledFonts: BundledFont[] = [
  {
    family: 'Inter',
    cssFamily: 'Inter Variable',
    category: 'sans',
    variable: true,
    load: () => import('@fontsource-variable/inter').then(() => {}),
    cdnUrl: 'https://cdn.jsdelivr.net/fontsource/fonts/inter:vf@latest/latin-wght-normal.woff2',
  },
  {
    family: 'DM Sans',
    cssFamily: 'DM Sans Variable',
    category: 'sans',
    variable: true,
    load: () => import('@fontsource-variable/dm-sans').then(() => {}),
    cdnUrl: 'https://cdn.jsdelivr.net/fontsource/fonts/dm-sans:vf@latest/latin-wght-normal.woff2',
  },
  {
    family: 'Outfit',
    cssFamily: 'Outfit Variable',
    category: 'sans',
    variable: true,
    load: () => import('@fontsource-variable/outfit').then(() => {}),
    cdnUrl: 'https://cdn.jsdelivr.net/fontsource/fonts/outfit:vf@latest/latin-wght-normal.woff2',
  },
  {
    family: 'Montserrat',
    cssFamily: 'Montserrat Variable',
    category: 'sans',
    variable: true,
    load: () => import('@fontsource-variable/montserrat').then(() => {}),
    cdnUrl: 'https://cdn.jsdelivr.net/fontsource/fonts/montserrat:vf@latest/latin-wght-normal.woff2',
  },
  {
    family: 'Lora',
    cssFamily: 'Lora Variable',
    category: 'serif',
    variable: true,
    load: () => import('@fontsource-variable/lora').then(() => {}),
    cdnUrl: 'https://cdn.jsdelivr.net/fontsource/fonts/lora:vf@latest/latin-wght-normal.woff2',
  },
  {
    family: 'Merriweather',
    cssFamily: 'Merriweather Variable',
    category: 'serif',
    variable: true,
    load: () => import('@fontsource-variable/merriweather').then(() => {}),
    cdnUrl: 'https://cdn.jsdelivr.net/fontsource/fonts/merriweather:vf@latest/latin-wght-normal.woff2',
  },
  {
    family: 'Playfair Display',
    cssFamily: 'Playfair Display Variable',
    category: 'serif',
    variable: true,
    load: () => import('@fontsource-variable/playfair-display').then(() => {}),
    cdnUrl: 'https://cdn.jsdelivr.net/fontsource/fonts/playfair-display:vf@latest/latin-wght-normal.woff2',
  },
  {
    family: 'JetBrains Mono',
    cssFamily: 'JetBrains Mono Variable',
    category: 'mono',
    variable: true,
    load: () => import('@fontsource-variable/jetbrains-mono').then(() => {}),
    cdnUrl: 'https://cdn.jsdelivr.net/fontsource/fonts/jetbrains-mono:vf@latest/latin-wght-normal.woff2',
  },
  {
    family: 'Comfortaa',
    cssFamily: 'Comfortaa Variable',
    category: 'display',
    variable: true,
    load: () => import('@fontsource-variable/comfortaa').then(() => {}),
    cdnUrl: 'https://cdn.jsdelivr.net/fontsource/fonts/comfortaa:vf@latest/latin-wght-normal.woff2',
  },
  {
    family: 'Comic Relief',
    cssFamily: 'Comic Relief',
    category: 'handwriting',
    variable: false,
    load: async () => {
      await import('@fontsource/comic-relief/400.css');
      await import('@fontsource/comic-relief/700.css');
    },
    cdnUrl: 'https://cdn.jsdelivr.net/fontsource/fonts/comic-relief@latest/latin-400-normal.woff2',
  },
  {
    family: 'Permanent Marker',
    cssFamily: 'Permanent Marker',
    category: 'display',
    variable: false,
    load: () => import('@fontsource/permanent-marker/400.css').then(() => {}),
    cdnUrl: 'https://cdn.jsdelivr.net/fontsource/fonts/permanent-marker@latest/latin-400-normal.woff2',
  },
  {
    family: 'Cherry Bomb One',
    cssFamily: 'Cherry Bomb One',
    category: 'display',
    variable: false,
    load: () => import('@fontsource/cherry-bomb-one/400.css').then(() => {}),
    cdnUrl: 'https://cdn.jsdelivr.net/fontsource/fonts/cherry-bomb-one@latest/latin-400-normal.woff2',
  },
  {
    family: 'Creepster',
    cssFamily: 'Creepster',
    category: 'display',
    variable: false,
    load: () => import('@fontsource/creepster/400.css').then(() => {}),
    cdnUrl: 'https://cdn.jsdelivr.net/fontsource/fonts/creepster@latest/latin-400-normal.woff2',
  },
  {
    family: 'Silkscreen',
    cssFamily: 'Silkscreen',
    category: 'display',
    variable: false,
    load: () => import('@fontsource/silkscreen/400.css').then(() => {}),
    cdnUrl: 'https://cdn.jsdelivr.net/fontsource/fonts/silkscreen@latest/latin-400-normal.woff2',
  },
  {
    family: 'Bungee Shade',
    cssFamily: 'Bungee Shade',
    category: 'display',
    variable: false,
    load: () => import('@fontsource/bungee-shade/400.css').then(() => {}),
    cdnUrl: 'https://cdn.jsdelivr.net/fontsource/fonts/bungee-shade@latest/latin-400-normal.woff2',
  },
  {
    family: 'Luckiest Guy',
    cssFamily: 'Luckiest Guy',
    category: 'display',
    variable: false,
    load: () => import('@fontsource/luckiest-guy/400.css').then(() => {}),
    cdnUrl: 'https://cdn.jsdelivr.net/fontsource/fonts/luckiest-guy@latest/latin-400-normal.woff2',
  },
  {
    family: 'Press Start 2P',
    cssFamily: 'Press Start 2P',
    category: 'display',
    variable: false,
    load: () => import('@fontsource/press-start-2p/400.css').then(() => {}),
    cdnUrl: 'https://cdn.jsdelivr.net/fontsource/fonts/press-start-2p@latest/latin-400-normal.woff2',
  },
  {
    family: 'Fredoka',
    cssFamily: 'Fredoka Variable',
    category: 'display',
    variable: true,
    load: () => import('@fontsource-variable/fredoka').then(() => {}),
    cdnUrl: 'https://cdn.jsdelivr.net/fontsource/fonts/fredoka:vf@latest/latin-wght-normal.woff2',
  },
  {
    family: 'Caveat',
    cssFamily: 'Caveat',
    category: 'handwriting',
    variable: false,
    load: () => import('@fontsource/caveat/400.css').then(() => {}),
    cdnUrl: 'https://cdn.jsdelivr.net/fontsource/fonts/caveat@latest/latin-400-normal.woff2',
  },
  {
    family: 'Pacifico',
    cssFamily: 'Pacifico',
    category: 'handwriting',
    variable: false,
    load: () => import('@fontsource/pacifico/400.css').then(() => {}),
    cdnUrl: 'https://cdn.jsdelivr.net/fontsource/fonts/pacifico@latest/latin-400-normal.woff2',
  },
  {
    family: 'Pirata One',
    cssFamily: 'Pirata One',
    category: 'display',
    variable: false,
    load: () => import('@fontsource/pirata-one/400.css').then(() => {}),
    cdnUrl: 'https://cdn.jsdelivr.net/fontsource/fonts/pirata-one@latest/latin-400-normal.woff2',
  },
  {
    family: 'Special Elite',
    cssFamily: 'Special Elite',
    category: 'display',
    variable: false,
    load: () => import('@fontsource/special-elite/400.css').then(() => {}),
    cdnUrl: 'https://cdn.jsdelivr.net/fontsource/fonts/special-elite@latest/latin-400-normal.woff2',
  },
  {
    family: 'Nunito',
    cssFamily: 'Nunito Variable',
    category: 'sans',
    variable: true,
    load: () => import('@fontsource-variable/nunito').then(() => {}),
    cdnUrl: 'https://cdn.jsdelivr.net/fontsource/fonts/nunito:vf@latest/latin-wght-normal.woff2',
  },
  {
    family: 'Courier Prime',
    cssFamily: 'Courier Prime',
    category: 'mono',
    variable: false,
    load: async () => {
      await import('@fontsource/courier-prime/400.css');
      await import('@fontsource/courier-prime/700.css');
    },
    cdnUrl: 'https://cdn.jsdelivr.net/fontsource/fonts/courier-prime@latest/latin-400-normal.woff2',
  },
  {
    family: 'Comic Neue',
    cssFamily: 'Comic Neue',
    category: 'handwriting',
    variable: false,
    load: async () => {
      await import('@fontsource/comic-neue/400.css');
      await import('@fontsource/comic-neue/700.css');
    },
    cdnUrl: 'https://cdn.jsdelivr.net/fontsource/fonts/comic-neue@latest/latin-400-normal.woff2',
  },
];

/** Comma-separated list of available bundled font names (for AI tool descriptions and system prompts). */
export const AVAILABLE_FONT_NAMES = bundledFonts.map((f) => f.family).join(', ');

/** Map from lowercase family name to BundledFont for quick lookup. */
const bundledFontMap = new Map(
  bundledFonts.map((f) => [f.family.toLowerCase(), f]),
);

/** Find a bundled font by family name (case-insensitive). Returns undefined if not bundled. */
export function findBundledFont(family: string): BundledFont | undefined {
  return bundledFontMap.get(family.toLowerCase());
}

/**
 * Resolve the CSS font-family name for a given canonical family name.
 * For bundled variable fonts, this returns the fontsource-registered name
 * (e.g., "Comfortaa" → "Comfortaa Variable"). For non-bundled fonts,
 * returns the family name as-is.
 */
export function resolveCssFamily(family: string): string {
  const bundled = bundledFontMap.get(family.toLowerCase());
  return bundled?.cssFamily ?? family;
}

/** Tracks which fonts have already been loaded. */
const loadedFonts = new Set<string>();

/**
 * Ensure a bundled font is loaded (idempotent).
 * Returns true if the font was found and loaded, false if not bundled.
 */
export async function loadBundledFont(family: string): Promise<boolean> {
  const key = family.toLowerCase();
  if (loadedFonts.has(key)) return true;

  const font = bundledFontMap.get(key);
  if (!font) return false;

  try {
    await font.load();
    loadedFonts.add(key);
    return true;
  } catch (error) {
    console.error(`Failed to load bundled font "${family}":`, error);
    return false;
  }
}
