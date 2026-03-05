import type { Theme } from '@/contexts/AppContext';
import { deriveTokensFromCore } from '@/lib/colorUtils';

/**
 * The 3 core colors that define a theme.
 * All other Tailwind tokens are derived automatically from these.
 */
export interface CoreThemeColors {
  /** Background color (HSL string, e.g. "228 20% 10%") */
  background: string;
  /** Text/foreground color */
  text: string;
  /** Primary accent color (buttons, links, focus rings) */
  primary: string;
}

// ─── Font Types ───────────────────────────────────────────────────────

/** A font reference: family name + optional URL (URL required on Nostr events, optional locally for bundled fonts). */
export interface ThemeFont {
  /** CSS font-family name, e.g. "Playfair Display" */
  family: string;
  /** Direct URL to a font file (.woff2, .ttf, .otf). Required on Nostr events, optional locally. */
  url?: string;
}

// ─── Background Types ─────────────────────────────────────────────────

/** Background image/video configuration. */
export interface ThemeBackground {
  /** URL to an image or video file */
  url: string;
  /** Display mode */
  mode?: 'cover' | 'tile';
  /** Dimensions as "widthxheight", e.g. "1920x1080" */
  dimensions?: string;
  /** MIME type, e.g. "image/jpeg" */
  mimeType?: string;
  /** Blurhash placeholder for progressive loading */
  blurhash?: string;
}

// ─── ThemeConfig ──────────────────────────────────────────────────────

/**
 * Complete theme configuration. Wraps CoreThemeColors with optional
 * font and background settings. This is the canonical type stored in
 * AppConfig.customTheme, EncryptedSettings, and theme events.
 */
export interface ThemeConfig {
  /** Theme name (stored locally AND on events) */
  title?: string;
  /** The 3 core colors */
  colors: CoreThemeColors;
  /** Optional custom font (applies globally to all text) */
  font?: ThemeFont;
  /** Optional background media */
  background?: ThemeBackground;
}

/**
 * Configured light and dark themes. When set in AppConfig,
 * these override the builtin themes for "light" and "dark" modes.
 */
export interface ThemesConfig {
  /** Theme config applied when theme resolves to "light". */
  light: ThemeConfig;
  /** Theme config applied when theme resolves to "dark". */
  dark: ThemeConfig;
}

/**
 * Full set of CSS token values used internally by Tailwind.
 * These are derived from CoreThemeColors via deriveTokensFromCore().
 */
export interface ThemeTokens {
  background: string;
  foreground: string;
  card: string;
  cardForeground: string;
  popover: string;
  popoverForeground: string;
  primary: string;
  primaryForeground: string;
  secondary: string;
  secondaryForeground: string;
  muted: string;
  mutedForeground: string;
  accent: string;
  accentForeground: string;
  destructive: string;
  destructiveForeground: string;
  border: string;
  input: string;
  ring: string;
}

/**
 * Builtin themes whose colors are defined at build time.
 * Self-hosters can customize these values before building.
 */
export const builtinThemes: Record<'light' | 'dark', CoreThemeColors> = {
  light: {
    background: '270 50% 97%',
    text: '270 25% 12%',
    primary: '270 65% 55%',
  },

  dark: {
    background: '228 20% 10%',
    text: '210 40% 98%',
    primary: '258 70% 60%',
  },
};

/** Metadata for a theme preset. */
export interface ThemePreset {
  /** Display label. */
  label: string;
  /** Emoji shown in compact theme pickers (dropdowns, cycle buttons). */
  emoji: string;
  /** Whether to show in compact pickers (sidebar dropdown, mobile drawer). All presets appear in settings. */
  featured?: boolean;
  /** The 3 core colors. */
  colors: CoreThemeColors;
  /** Optional custom font for this preset. */
  font?: ThemeFont;
  /** Optional background for this preset. */
  background?: ThemeBackground;
}

/**
 * Custom theme presets. Clicking a preset sets theme to "custom"
 * and applies the preset's core color values to customTheme.
 */
export const themePresets: Record<string, ThemePreset> = {
  pink: {
    label: 'Pink',
    emoji: '🌸',
    featured: true,
    colors: {
      background: '330 100% 96%',
      text: '330 30% 10%',
      primary: '330 90% 60%',
    },
    font: { family: 'Comfortaa' },
    background: {
      url: 'https://blossom.ditto.pub/2c9d4fe206f39b81655eab559998a89e1dca12f4db81c10fd8f472c69fe9c68a.jpeg',
      mode: 'cover',
      mimeType: 'image/jpeg',
    },
  },

  toxic: {
    label: 'Toxic',
    emoji: '☢️',
    colors: {
      background: '130 30% 7%',
      text: '120 40% 92%',
      primary: '128 70% 42%',
    },
    font: { family: 'JetBrains Mono' },
  },


  sunset: {
    label: 'Sunset',
    emoji: '🌅',
    colors: {
      background: '20 40% 96%',
      text: '15 30% 12%',
      primary: '15 85% 55%',
    },
    font: { family: 'Lora' },
  },

  skater: {
    label: 'Skater',
    emoji: '🛹',
    featured: true,
    colors: {
      background: '0 0% 42%',
      text: '0 0% 100%',
      primary: '80 100% 50%',
    },
    font: { family: 'Rubik Maps' },
    background: {
      url: 'https://blossom.primal.net/9c4262aaa53d8feae41b3b6206647e25c6f388d9e836fb3e8abcf9be72be493e.png',
      mode: 'cover',
      mimeType: 'image/png',
    },
  },

  kawaii: {
    label: 'Kawaii',
    emoji: '🌸',
    featured: true,
    colors: {
      background: '340 60% 95%',
      text: '345 30% 35%',
      primary: '340 100% 76%',
    },
    font: { family: 'Cherry Bomb One' },
    background: {
      url: 'https://blossom.ditto.pub/4e11a3ca749f9cc8989b61cb9efe78682533d2836eccaf4bccf104dd7b583e09.png',
      mode: 'cover',
      mimeType: 'image/png',
    },
  },

  grunge: {
    label: 'Grunge',
    emoji: '🖤',
    featured: true,
    colors: {
      background: '276 40% 8%',
      text: '0 0% 75%',
      primary: '328 100% 54%',
    },
    font: { family: 'Lacquer' },
    background: {
      url: 'https://blossom.primal.net/9fa0f1f7cd7da344f3e1db6ecfbdbeb2bb0763d3eaccbc0f5368871d0421b50b.png',
      mode: 'cover',
      mimeType: 'image/png',
    },
  },

  mspaint: {
    label: 'MS Paint',
    emoji: '🖥️',
    featured: true,
    colors: {
      background: '200 20% 95%',
      text: '0 0% 10%',
      primary: '240 100% 50%',
    },
    font: { family: 'Silkscreen' },
    background: {
      url: 'https://blossom.ditto.pub/946fedd46ec6b283472c0b3a102817ff414a6d640517df5c679bb63830ef21bf.png',
      mode: 'cover',
      mimeType: 'image/png',
    },
  },

  retropop: {
    label: 'Retro Pop',
    emoji: '💿',
    featured: true,
    colors: {
      background: '244 100% 92%',
      text: '40 40% 10%',
      primary: '260 50% 70%',
    },
    font: { family: 'Bungee Shade' },
    background: {
      url: 'https://blossom.ditto.pub/3832abebc944668c4c0bd34309b0dfe120054671e20ca8c8e9abbb24114c972e.png',
      mode: 'cover',
      mimeType: 'image/png',
    },
  },

  bubblegum: {
    label: 'Bubblegum',
    emoji: '🍬',
    featured: true,
    colors: {
      background: '0 0% 100%',
      text: '285 25% 31%',
      primary: '279 100% 50%',
    },
    font: { family: 'Barriecito' },
    background: {
      url: 'https://blossom.ditto.pub/edd3139e0c4d60b96dcf54edbe7410b1f58d9e5753c8d481fe9bb6812aca00d4.png',
      mode: 'cover',
      mimeType: 'image/png',
    },
  },

  gamer: {
    label: 'Gamer',
    emoji: '⚡',
    featured: true,
    colors: {
      background: '140 60% 4%',
      text: '120 100% 50%',
      primary: '195 100% 50%',
    },
    font: { family: 'Press Start 2P' },
    background: {
      url: 'https://blossom.ditto.pub/c5597382d7da762dcce32b5b5dbbd95a719faee5cad7c356df1956648b58be69.png',
      mode: 'cover',
      mimeType: 'image/png',
    },
  },

  // ─── Themes inspired by MySpace Windows93 ──────────────────────────

  gothic: {
    label: 'Gothic',
    emoji: '🥀',
    featured: true,
    colors: {
      background: '0 60% 8%',
      text: '0 0% 90%',
      primary: '0 100% 45%',
    },
    font: { family: 'Cinzel' },
    background: {
      url: 'https://images.unsplash.com/photo-1518882570535-be5e3f4d8e76?w=1920&q=80',
      mode: 'cover',
      mimeType: 'image/jpeg',
    },
  },

  cottage: {
    label: 'Cottage',
    emoji: '🌿',
    featured: true,
    colors: {
      background: '100 25% 92%',
      text: '100 20% 12%',
      primary: '43 80% 55%',
    },
    font: { family: 'Lora' },
    background: {
      url: 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=1920&q=80',
      mode: 'cover',
      mimeType: 'image/jpeg',
    },
  },

  candyheart: {
    label: 'Candy Heart',
    emoji: '🍭',
    colors: {
      background: '340 80% 92%',
      text: '280 30% 20%',
      primary: '330 85% 55%',
    },
    font: { family: 'Comfortaa' },
    background: {
      url: 'https://images.unsplash.com/photo-1558618666-fcd25c85f82e?w=1920&q=80',
      mode: 'cover',
      mimeType: 'image/jpeg',
    },
  },

  midnight: {
    label: 'Midnight',
    emoji: '🌃',
    featured: true,
    colors: {
      background: '0 0% 9%',
      text: '0 0% 95%',
      primary: '190 100% 50%',
    },
    font: { family: 'Inter' },
    background: {
      url: 'https://images.unsplash.com/photo-1519501025264-65ba15a82390?w=1920&q=80',
      mode: 'cover',
      mimeType: 'image/jpeg',
    },
  },

  hologram: {
    label: 'Hologram',
    emoji: '☁️',
    colors: {
      background: '200 60% 88%',
      text: '220 30% 15%',
      primary: '280 55% 65%',
    },
    font: { family: 'Nunito' },
    background: {
      url: 'https://images.unsplash.com/photo-1517483000871-1dbf64a6e1c6?w=1920&q=80',
      mode: 'cover',
      mimeType: 'image/jpeg',
    },
  },

  floret: {
    label: 'Floret',
    emoji: '🌼',
    colors: {
      background: '10 70% 90%',
      text: '0 0% 100%',
      primary: '160 60% 70%',
    },
    font: { family: 'Quicksand' },
    background: {
      url: 'https://images.unsplash.com/photo-1490750967868-88aa4f44baee?w=1920&q=80',
      mode: 'cover',
      mimeType: 'image/jpeg',
    },
  },

  win95: {
    label: 'Win 95',
    emoji: '🪟',
    featured: true,
    colors: {
      background: '0 0% 75%',
      text: '0 0% 5%',
      primary: '240 100% 30%',
    },
    font: { family: 'Courier Prime' },
    background: {
      url: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=1920&q=80',
      mode: 'cover',
      mimeType: 'image/jpeg',
    },
  },

  plush: {
    label: 'Plush',
    emoji: '🧸',
    colors: {
      background: '265 55% 72%',
      text: '55 100% 50%',
      primary: '210 90% 55%',
    },
    font: { family: 'Comic Neue' },
    background: {
      url: 'https://images.unsplash.com/photo-1550684376-efcbd6e3f031?w=1920&q=80',
      mode: 'cover',
      mimeType: 'image/jpeg',
    },
  },
};

/** Converts a camelCase key to a CSS custom property name, e.g. primaryForeground → --primary-foreground */
export function toThemeVar(key: string): string {
  return `--${key.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`)}`;
}

/** Builds a CSS :root block string from a ThemeTokens object */
export function buildThemeCss(tokens: ThemeTokens): string {
  const vars = (Object.entries(tokens) as [string, string][])
    .map(([k, v]) => `${toThemeVar(k)}: ${v};`)
    .join(' ');
  return `:root { ${vars} }`;
}

/** Derive full ThemeTokens from CoreThemeColors */
export function coreToTokens(colors: CoreThemeColors): ThemeTokens {
  return deriveTokensFromCore(colors.background, colors.text, colors.primary);
}

/** Build CSS from CoreThemeColors (convenience) */
export function buildThemeCssFromCore(colors: CoreThemeColors): string {
  return buildThemeCss(coreToTokens(colors));
}

/**
 * Resolves a theme preference to the concrete builtin theme name.
 * - "system" → "light" or "dark" based on OS preference.
 * - "custom" → returns "custom" (caller must supply colors from config.customTheme).
 * - "light" / "dark" → returned as-is.
 */
export function resolveTheme(theme: Theme): 'light' | 'dark' | 'custom' {
  if (theme === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return theme;
}

/**
 * Resolves the effective ThemeConfig for a "light" or "dark" mode.
 * Uses configured themes from AppConfig if available, otherwise falls back
 * to the builtin themes (colors only, no font/background).
 */
export function resolveThemeConfig(mode: 'light' | 'dark', themes?: ThemesConfig): ThemeConfig {
  return themes?.[mode] ?? { colors: builtinThemes[mode] };
}
