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

/** Built-in theme token sets. Custom themes are stored in AppConfig.customTheme. */
export const themes: Record<Exclude<Theme, 'custom'>, ThemeTokens> = {
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

  black: {
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

  pink: {
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
