import type { Theme } from '@/contexts/AppContext';

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
  sidebarBackground: string;
  sidebarForeground: string;
  sidebarPrimary: string;
  sidebarPrimaryForeground: string;
  sidebarAccent: string;
  sidebarAccentForeground: string;
  sidebarBorder: string;
  sidebarRing: string;
}

/**
 * Builtin themes whose colors are defined at build time.
 * Self-hosters can customize these values before building.
 */
export const builtinThemes: Record<'light' | 'dark', ThemeTokens> = {
  light: {
    background: '0 0% 100%',
    foreground: '222.2 84% 4.9%',
    card: '0 0% 100%',
    cardForeground: '222.2 84% 4.9%',
    popover: '0 0% 100%',
    popoverForeground: '222.2 84% 4.9%',
    primary: '258 70% 55%',
    primaryForeground: '0 0% 100%',
    secondary: '210 40% 96.1%',
    secondaryForeground: '222.2 47.4% 11.2%',
    muted: '210 40% 96.1%',
    mutedForeground: '215.4 16.3% 46.9%',
    accent: '258 70% 55%',
    accentForeground: '0 0% 100%',
    destructive: '0 84.2% 60.2%',
    destructiveForeground: '210 40% 98%',
    border: '214.3 31.8% 91.4%',
    input: '214.3 31.8% 91.4%',
    ring: '258 70% 55%',
    sidebarBackground: '0 0% 98%',
    sidebarForeground: '240 5.3% 26.1%',
    sidebarPrimary: '258 70% 55%',
    sidebarPrimaryForeground: '0 0% 98%',
    sidebarAccent: '240 4.8% 95.9%',
    sidebarAccentForeground: '240 5.9% 10%',
    sidebarBorder: '220 13% 91%',
    sidebarRing: '258 70% 55%',
  },

  dark: {
    background: '228 20% 10%',
    foreground: '210 40% 98%',
    card: '228 20% 12%',
    cardForeground: '210 40% 98%',
    popover: '228 20% 12%',
    popoverForeground: '210 40% 98%',
    primary: '258 70% 60%',
    primaryForeground: '0 0% 100%',
    secondary: '228 16% 18%',
    secondaryForeground: '210 40% 98%',
    muted: '228 16% 18%',
    mutedForeground: '215 20.2% 65.1%',
    accent: '258 70% 60%',
    accentForeground: '0 0% 100%',
    destructive: '0 72% 51%',
    destructiveForeground: '210 40% 98%',
    border: '228 14% 20%',
    input: '228 14% 20%',
    ring: '258 70% 60%',
    sidebarBackground: '228 22% 8%',
    sidebarForeground: '240 4.8% 95.9%',
    sidebarPrimary: '258 70% 60%',
    sidebarPrimaryForeground: '0 0% 100%',
    sidebarAccent: '228 16% 14%',
    sidebarAccentForeground: '240 4.8% 95.9%',
    sidebarBorder: '228 14% 20%',
    sidebarRing: '258 70% 60%',
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
  /** Full set of CSS token values. */
  tokens: ThemeTokens;
}

/**
 * Custom theme presets. Clicking a preset sets theme to "custom"
 * and applies the preset's token values to customTheme.
 */
export const themePresets: Record<string, ThemePreset> = {
  black: {
    label: 'Black',
    emoji: '⚫',
    featured: true,
    tokens: {
    background: '0 0% 0%',
    foreground: '0 0% 95%',
    card: '0 0% 5%',
    cardForeground: '0 0% 95%',
    popover: '0 0% 5%',
    popoverForeground: '0 0% 95%',
    primary: '258 70% 60%',
    primaryForeground: '0 0% 100%',
    secondary: '0 0% 10%',
    secondaryForeground: '0 0% 95%',
    muted: '0 0% 10%',
    mutedForeground: '0 0% 65%',
    accent: '258 70% 60%',
    accentForeground: '0 0% 100%',
    destructive: '0 72% 51%',
    destructiveForeground: '0 0% 95%',
    border: '0 0% 15%',
    input: '0 0% 15%',
    ring: '258 70% 60%',
    sidebarBackground: '0 0% 3%',
    sidebarForeground: '0 0% 90%',
    sidebarPrimary: '258 70% 60%',
    sidebarPrimaryForeground: '0 0% 100%',
    sidebarAccent: '0 0% 8%',
    sidebarAccentForeground: '0 0% 90%',
    sidebarBorder: '0 0% 15%',
    sidebarRing: '258 70% 60%',
    },
  },

  pink: {
    label: 'Pink',
    emoji: '🌸',
    featured: true,
    tokens: {
      background: '330 100% 96%',
      foreground: '330 30% 10%',
      card: '330 100% 99%',
      cardForeground: '330 30% 10%',
      popover: '330 100% 99%',
      popoverForeground: '330 30% 10%',
      primary: '330 90% 60%',
      primaryForeground: '0 0% 100%',
      secondary: '330 60% 90%',
      secondaryForeground: '330 30% 15%',
      muted: '330 60% 90%',
      mutedForeground: '330 25% 45%',
      accent: '330 90% 60%',
      accentForeground: '0 0% 100%',
      destructive: '0 84.2% 60.2%',
      destructiveForeground: '210 40% 98%',
      border: '330 40% 85%',
      input: '330 40% 85%',
      ring: '330 90% 60%',
      sidebarBackground: '330 80% 95%',
      sidebarForeground: '330 30% 15%',
      sidebarPrimary: '330 90% 60%',
      sidebarPrimaryForeground: '0 0% 100%',
      sidebarAccent: '330 60% 88%',
      sidebarAccentForeground: '330 30% 15%',
      sidebarBorder: '330 40% 82%',
      sidebarRing: '330 90% 60%',
    },
  },

  midnight: {
    label: 'Midnight',
    emoji: '🌙',
    tokens: {
      background: '230 35% 7%',
      foreground: '210 40% 92%',
      card: '230 32% 10%',
      cardForeground: '210 40% 92%',
      popover: '230 32% 10%',
      popoverForeground: '210 40% 92%',
      primary: '210 100% 55%',
      primaryForeground: '0 0% 100%',
      secondary: '230 25% 15%',
      secondaryForeground: '210 40% 92%',
      muted: '230 25% 15%',
      mutedForeground: '215 20% 58%',
      accent: '210 100% 55%',
      accentForeground: '0 0% 100%',
      destructive: '0 72% 51%',
      destructiveForeground: '210 40% 98%',
      border: '230 22% 17%',
      input: '230 22% 17%',
      ring: '210 100% 55%',
      sidebarBackground: '230 38% 5%',
      sidebarForeground: '210 30% 88%',
      sidebarPrimary: '210 100% 55%',
      sidebarPrimaryForeground: '0 0% 100%',
      sidebarAccent: '230 25% 12%',
      sidebarAccentForeground: '210 30% 88%',
      sidebarBorder: '230 22% 17%',
      sidebarRing: '210 100% 55%',
    },
  },

  toxic: {
    label: 'Toxic',
    emoji: '☢️',
    tokens: {
      background: '130 30% 7%',
      foreground: '120 40% 92%',
      card: '130 28% 10%',
      cardForeground: '120 40% 92%',
      popover: '130 28% 10%',
      popoverForeground: '120 40% 92%',
      primary: '128 70% 42%',
      primaryForeground: '0 0% 100%',
      secondary: '130 22% 16%',
      secondaryForeground: '120 40% 92%',
      muted: '130 22% 16%',
      mutedForeground: '120 25% 60%',
      accent: '128 70% 42%',
      accentForeground: '0 0% 100%',
      destructive: '0 72% 51%',
      destructiveForeground: '120 40% 92%',
      border: '130 20% 18%',
      input: '130 20% 18%',
      ring: '128 70% 42%',
      sidebarBackground: '130 32% 5%',
      sidebarForeground: '120 35% 88%',
      sidebarPrimary: '128 70% 42%',
      sidebarPrimaryForeground: '0 0% 100%',
      sidebarAccent: '130 24% 12%',
      sidebarAccentForeground: '120 35% 88%',
      sidebarBorder: '130 20% 14%',
      sidebarRing: '128 70% 42%',
    },
  },

  lavender: {
    label: 'Lavender',
    emoji: '💜',
    tokens: {
      background: '270 50% 97%',
      foreground: '270 25% 12%',
      card: '270 60% 99%',
      cardForeground: '270 25% 12%',
      popover: '270 60% 99%',
      popoverForeground: '270 25% 12%',
      primary: '270 65% 55%',
      primaryForeground: '0 0% 100%',
      secondary: '270 40% 92%',
      secondaryForeground: '270 25% 15%',
      muted: '270 40% 92%',
      mutedForeground: '270 20% 48%',
      accent: '270 65% 55%',
      accentForeground: '0 0% 100%',
      destructive: '0 84.2% 60.2%',
      destructiveForeground: '210 40% 98%',
      border: '270 30% 88%',
      input: '270 30% 88%',
      ring: '270 65% 55%',
      sidebarBackground: '270 40% 96%',
      sidebarForeground: '270 25% 18%',
      sidebarPrimary: '270 65% 55%',
      sidebarPrimaryForeground: '0 0% 100%',
      sidebarAccent: '270 35% 90%',
      sidebarAccentForeground: '270 25% 18%',
      sidebarBorder: '270 28% 85%',
      sidebarRing: '270 65% 55%',
    },
  },

  ocean: {
    label: 'Ocean',
    emoji: '🌊',
    tokens: {
      background: '200 30% 8%',
      foreground: '195 20% 90%',
      card: '200 28% 11%',
      cardForeground: '195 20% 90%',
      popover: '200 28% 11%',
      popoverForeground: '195 20% 90%',
      primary: '190 80% 45%',
      primaryForeground: '0 0% 100%',
      secondary: '200 22% 16%',
      secondaryForeground: '195 20% 90%',
      muted: '200 22% 16%',
      mutedForeground: '195 15% 55%',
      accent: '190 80% 45%',
      accentForeground: '0 0% 100%',
      destructive: '0 72% 51%',
      destructiveForeground: '195 20% 95%',
      border: '200 18% 18%',
      input: '200 18% 18%',
      ring: '190 80% 45%',
      sidebarBackground: '200 32% 6%',
      sidebarForeground: '195 15% 85%',
      sidebarPrimary: '190 80% 45%',
      sidebarPrimaryForeground: '0 0% 100%',
      sidebarAccent: '200 22% 12%',
      sidebarAccentForeground: '195 15% 85%',
      sidebarBorder: '200 18% 18%',
      sidebarRing: '190 80% 45%',
    },
  },

  sunset: {
    label: 'Sunset',
    emoji: '🌅',
    tokens: {
      background: '20 40% 96%',
      foreground: '15 30% 12%',
      card: '20 50% 99%',
      cardForeground: '15 30% 12%',
      popover: '20 50% 99%',
      popoverForeground: '15 30% 12%',
      primary: '15 85% 55%',
      primaryForeground: '0 0% 100%',
      secondary: '20 40% 90%',
      secondaryForeground: '15 30% 15%',
      muted: '20 40% 90%',
      mutedForeground: '15 20% 45%',
      accent: '15 85% 55%',
      accentForeground: '0 0% 100%',
      destructive: '0 84.2% 60.2%',
      destructiveForeground: '210 40% 98%',
      border: '20 30% 85%',
      input: '20 30% 85%',
      ring: '15 85% 55%',
      sidebarBackground: '20 35% 95%',
      sidebarForeground: '15 30% 18%',
      sidebarPrimary: '15 85% 55%',
      sidebarPrimaryForeground: '0 0% 100%',
      sidebarAccent: '20 35% 88%',
      sidebarAccentForeground: '15 30% 18%',
      sidebarBorder: '20 28% 82%',
      sidebarRing: '15 85% 55%',
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

/**
 * Resolves a theme preference to the concrete builtin theme name.
 * - "system" → "light" or "dark" based on OS preference.
 * - "custom" → returns "custom" (caller must supply tokens from config.customTheme).
 * - "light" / "dark" → returned as-is.
 */
export function resolveTheme(theme: Theme): 'light' | 'dark' | 'custom' {
  if (theme === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return theme;
}
