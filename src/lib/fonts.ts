/**
 * Bundled font registry.
 *
 * Maps font family names to their fontsource dynamic import functions.
 * Fonts are loaded lazily — only imported when actually used.
 */

export type FontCategory = 'sans' | 'serif' | 'mono' | 'display' | 'handwriting';

export interface BundledFont {
  /** CSS font-family name */
  family: string;
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
    category: 'sans',
    variable: true,
    load: () => import('@fontsource-variable/inter').then(() => {}),
    cdnUrl: 'https://cdn.jsdelivr.net/fontsource/fonts/inter:vf@latest/latin-wght-normal.woff2',
  },
  {
    family: 'DM Sans',
    category: 'sans',
    variable: true,
    load: () => import('@fontsource-variable/dm-sans').then(() => {}),
    cdnUrl: 'https://cdn.jsdelivr.net/fontsource/fonts/dm-sans:vf@latest/latin-wght-normal.woff2',
  },
  {
    family: 'Outfit',
    category: 'sans',
    variable: true,
    load: () => import('@fontsource-variable/outfit').then(() => {}),
    cdnUrl: 'https://cdn.jsdelivr.net/fontsource/fonts/outfit:vf@latest/latin-wght-normal.woff2',
  },
  {
    family: 'Montserrat',
    category: 'sans',
    variable: true,
    load: () => import('@fontsource-variable/montserrat').then(() => {}),
    cdnUrl: 'https://cdn.jsdelivr.net/fontsource/fonts/montserrat:vf@latest/latin-wght-normal.woff2',
  },
  {
    family: 'Lora',
    category: 'serif',
    variable: true,
    load: () => import('@fontsource-variable/lora').then(() => {}),
    cdnUrl: 'https://cdn.jsdelivr.net/fontsource/fonts/lora:vf@latest/latin-wght-normal.woff2',
  },
  {
    family: 'Merriweather',
    category: 'serif',
    variable: true,
    load: () => import('@fontsource-variable/merriweather').then(() => {}),
    cdnUrl: 'https://cdn.jsdelivr.net/fontsource/fonts/merriweather:vf@latest/latin-wght-normal.woff2',
  },
  {
    family: 'Playfair Display',
    category: 'serif',
    variable: true,
    load: () => import('@fontsource-variable/playfair-display').then(() => {}),
    cdnUrl: 'https://cdn.jsdelivr.net/fontsource/fonts/playfair-display:vf@latest/latin-wght-normal.woff2',
  },
  {
    family: 'JetBrains Mono',
    category: 'mono',
    variable: true,
    load: () => import('@fontsource-variable/jetbrains-mono').then(() => {}),
    cdnUrl: 'https://cdn.jsdelivr.net/fontsource/fonts/jetbrains-mono:vf@latest/latin-wght-normal.woff2',
  },
  {
    family: 'Comfortaa',
    category: 'display',
    variable: true,
    load: () => import('@fontsource-variable/comfortaa').then(() => {}),
    cdnUrl: 'https://cdn.jsdelivr.net/fontsource/fonts/comfortaa:vf@latest/latin-wght-normal.woff2',
  },
  {
    family: 'Comic Neue',
    category: 'handwriting',
    variable: false,
    load: async () => {
      await import('@fontsource/comic-neue/400.css');
      await import('@fontsource/comic-neue/700.css');
    },
    cdnUrl: 'https://cdn.jsdelivr.net/fontsource/fonts/comic-neue@latest/latin-400-normal.woff2',
  },
];

/** Map from lowercase family name to BundledFont for quick lookup. */
const bundledFontMap = new Map(
  bundledFonts.map((f) => [f.family.toLowerCase(), f]),
);

/** Find a bundled font by family name (case-insensitive). Returns undefined if not bundled. */
export function findBundledFont(family: string): BundledFont | undefined {
  return bundledFontMap.get(family.toLowerCase());
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
