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
