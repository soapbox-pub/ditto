import type { Theme } from '@/contexts/AppContext';
import { deriveTokensFromCore } from '@/lib/colorUtils';

/**
 * The 4 core colors that define a theme.
 * All other Tailwind tokens are derived automatically from these.
 * This is the format stored in config, Nostr events, and encrypted settings.
 */
export interface CoreThemeColors {
  /** Background color (HSL string, e.g. "228 20% 10%") */
  background: string;
  /** Text/foreground color */
  text: string;
  /** Primary accent color (buttons, links, focus rings) */
  primary: string;
  /** Secondary accent color (complementary highlights) */
  secondary: string;
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
    background: '0 0% 100%',
    text: '222.2 84% 4.9%',
    primary: '258 70% 55%',
    secondary: '47 80% 50%',
  },

  dark: {
    background: '228 20% 10%',
    text: '210 40% 98%',
    primary: '258 70% 60%',
    secondary: '47 80% 55%',
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
  /** The 4 core colors. */
  colors: CoreThemeColors;
}

/**
 * Custom theme presets. Clicking a preset sets theme to "custom"
 * and applies the preset's core color values to customTheme.
 */
export const themePresets: Record<string, ThemePreset> = {
  black: {
    label: 'Black',
    emoji: '⚫',
    featured: true,
    colors: {
      background: '0 0% 0%',
      text: '0 0% 95%',
      primary: '258 70% 60%',
      secondary: '225 65% 55%',
    },
  },

  pink: {
    label: 'Pink',
    emoji: '🌸',
    featured: true,
    colors: {
      background: '330 100% 96%',
      text: '330 30% 10%',
      primary: '330 90% 60%',
      secondary: '300 70% 55%',
    },
  },

  midnight: {
    label: 'Midnight',
    emoji: '🌙',
    colors: {
      background: '230 35% 7%',
      text: '210 40% 92%',
      primary: '210 100% 55%',
      secondary: '240 70% 60%',
    },
  },

  toxic: {
    label: 'Toxic',
    emoji: '☢️',
    colors: {
      background: '130 30% 7%',
      text: '120 40% 92%',
      primary: '128 70% 42%',
      secondary: '160 60% 40%',
    },
  },

  lavender: {
    label: 'Lavender',
    emoji: '💜',
    colors: {
      background: '270 50% 97%',
      text: '270 25% 12%',
      primary: '270 65% 55%',
      secondary: '240 55% 55%',
    },
  },

  ocean: {
    label: 'Ocean',
    emoji: '🌊',
    colors: {
      background: '200 30% 8%',
      text: '195 20% 90%',
      primary: '190 80% 45%',
      secondary: '220 70% 50%',
    },
  },

  sunset: {
    label: 'Sunset',
    emoji: '🌅',
    colors: {
      background: '20 40% 96%',
      text: '15 30% 12%',
      primary: '15 85% 55%',
      secondary: '35 80% 50%',
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
  return deriveTokensFromCore(colors.background, colors.text, colors.primary, colors.secondary);
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
