import { ReactNode, useLayoutEffect, useEffect } from 'react';
import { z } from 'zod';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { AppContext, type AppConfig, type AppContextType, type Theme, type RelayMetadata } from '@/contexts/AppContext';
import { builtinThemes, themePresets, buildThemeCssFromCore, coreToTokens, buildThemeCss, resolveTheme, type ThemeConfig, type ThemesConfig } from '@/themes';
import { ThemeSchemaCompat, ThemeConfigCompatSchema, ThemesConfigSchema, FeedSettingsSchema, ContentWarningPolicySchema } from '@/lib/schemas';
import { loadAndApplyFont } from '@/lib/fontLoader';

interface AppProviderProps {
  children: ReactNode;
  /** Application storage key */
  storageKey: string;
  /** Default app configuration */
  defaultConfig: AppConfig;
}

// Zod schema for RelayMetadata validation
const RelayMetadataSchema = z.object({
  relays: z.array(z.object({
    url: z.url(),
    read: z.boolean(),
    write: z.boolean(),
  })),
  updatedAt: z.number(),
}) satisfies z.ZodType<RelayMetadata>;

/**
 * Schema for customTheme in AppConfig localStorage.
 * Accepts ThemeConfig, bare CoreThemeColors, and legacy ThemeTokens format,
 * normalizing to ThemeConfig.
 */
const CustomThemeStorageSchema = ThemeConfigCompatSchema;

// Zod schema for AppConfig validation.
// Uses ThemeSchemaCompat so legacy "black"/"pink" values parse successfully.
// Migration to "custom" happens in the deserializer below.
const AppConfigSchema = z.object({
  theme: ThemeSchemaCompat,
  customTheme: CustomThemeStorageSchema.optional(),
  themes: ThemesConfigSchema.optional(),
  relayMetadata: RelayMetadataSchema,
  useAppRelays: z.boolean(),
  feedSettings: FeedSettingsSchema,
  sidebarOrder: z.array(z.string()),
  nip85StatsPubkey: z.string().refine(
    (val) => val.length === 0 || (val.length === 64 && /^[0-9a-f]{64}$/i.test(val)),
    { message: 'Must be empty or a valid 64-character hex pubkey' }
  ),
  blossomServers: z.array(z.url()),
  defaultZapComment: z.string(),
  faviconUrl: z.string(),
  linkPreviewUrl: z.string(),
  corsProxy: z.string(),
  contentWarningPolicy: ContentWarningPolicySchema,
});

export function AppProvider(props: AppProviderProps) {
  const {
    children,
    storageKey,
    defaultConfig,
  } = props;

  // App configuration state with localStorage persistence.
  // The deserializer uses safeParse per top-level field so that a single
  // invalid/incomplete field (e.g. feedSettings missing a new key) doesn't
  // nuke the entire config back to defaults. Valid fields are preserved.
  const [rawConfig, setConfig] = useLocalStorage<Partial<AppConfig>>(
    storageKey,
    {},
    {
      serialize: JSON.stringify,
      deserialize: (value: string) => {
        const parsed = JSON.parse(value);
        if (typeof parsed !== 'object' || parsed === null) return {};

        const result: Partial<AppConfig> = {};
        // Validate each top-level field individually
        for (const key of Object.keys(parsed)) {
          const fieldSchema = AppConfigSchema.shape[key as keyof typeof AppConfigSchema.shape];
          if (fieldSchema) {
            const fieldResult = fieldSchema.safeParse(parsed[key]);
            if (fieldResult.success) {
              (result as Record<string, unknown>)[key] = fieldResult.data;
            }
          }
        }

        // Migrate legacy theme values ("black", "pink") to "custom" + customTheme
        const legacyTheme = result.theme as string | undefined;
        if (legacyTheme && legacyTheme in themePresets) {
          result.theme = 'custom';
          result.customTheme = { colors: themePresets[legacyTheme].colors };
        }

        return result;
      }
    }
  );

  // Generic config updater with callback pattern
  const updateConfig = (updater: (currentConfig: Partial<AppConfig>) => Partial<AppConfig>) => {
    setConfig(updater);
  };

  const config = { ...defaultConfig, ...rawConfig };

  const appContextValue: AppContextType = {
    config,
    updateConfig,
  };

  // Apply theme effects to document
  useApplyTheme(config.theme, config.customTheme, config.themes);
  useApplyFonts(config.theme, config.customTheme, config.themes);
  useApplyBackground(config.theme, config.customTheme, config.themes);

  return (
    <AppContext.Provider value={appContextValue}>
      {children}
    </AppContext.Provider>
  );
}

/**
 * Hook to apply theme changes to the document root via an injected <style> tag.
 * When theme is "system", resolves to "light" or "dark" based on OS preference
 * and listens for changes to prefers-color-scheme.
 * When theme is "custom", uses the provided customTheme colors (derived to full tokens).
 * When theme is "light" or "dark", uses configured themes if available, otherwise builtin themes.
 */
function useApplyTheme(theme: Theme, customTheme: ThemeConfig | undefined, themes: ThemesConfig | undefined) {
  useLayoutEffect(() => {
    function apply() {
      const resolved = resolveTheme(theme);
      let css: string;

      if (resolved === 'custom') {
        // Use custom theme colors, falling back to dark if not yet set
        const colors = customTheme?.colors ?? builtinThemes.dark;
        css = buildThemeCssFromCore(colors);
      } else {
        // Use configured theme if available, otherwise fall back to builtin
        const configuredTheme = themes?.[resolved];
        const colors = configuredTheme?.colors ?? builtinThemes[resolved];
        css = buildThemeCssFromCore(colors);
      }

      let el = document.getElementById('theme-vars') as HTMLStyleElement | null;
      if (!el) {
        el = document.createElement('style');
        el.id = 'theme-vars';
        document.head.appendChild(el);
      }
      el.textContent = css;
      document.documentElement.className = resolved;
      // Now that CSS variables are set, the inline body background from
      // theme.js is no longer needed — bg-background will resolve correctly.
      document.body.removeAttribute('style');
    }

    apply();

    // When theme is "system", listen for OS color scheme changes
    if (theme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      mq.addEventListener('change', apply);
      return () => mq.removeEventListener('change', apply);
    }
  }, [theme, customTheme, themes]);
}

/**
 * Hook to load and apply custom fonts when the theme config changes.
 * Applies fonts from custom themes, or from configured light/dark themes if available.
 */
function useApplyFonts(theme: Theme, customTheme: ThemeConfig | undefined, themes: ThemesConfig | undefined) {
  const resolved = resolveTheme(theme);
  const configuredTheme = resolved !== 'custom' ? themes?.[resolved] : undefined;
  const fontFamily = resolved === 'custom' ? customTheme?.font?.family : configuredTheme?.font?.family;
  const fontUrl = resolved === 'custom' ? customTheme?.font?.url : configuredTheme?.font?.url;

  useEffect(() => {
    if (fontFamily) {
      loadAndApplyFont({ family: fontFamily, url: fontUrl });
    } else {
      // Clear any custom font overrides when no font is configured
      loadAndApplyFont(undefined);
    }
  }, [theme, fontFamily, fontUrl]);
}

/** Style element ID for background image CSS. */
const BG_STYLE_ID = 'theme-background';

/**
 * Hook to apply or remove a background image when the theme config changes.
 * Supports backgrounds from custom themes and configured light/dark themes.
 */
function useApplyBackground(theme: Theme, customTheme: ThemeConfig | undefined, themes: ThemesConfig | undefined) {
  const resolved = resolveTheme(theme);
  const configuredTheme = resolved !== 'custom' ? themes?.[resolved] : undefined;
  const activeBackground = resolved === 'custom' ? customTheme?.background : configuredTheme?.background;
  const bgUrl = activeBackground?.url;
  const bgMode = activeBackground?.mode ?? 'cover';

  useEffect(() => {
    let style = document.getElementById(BG_STYLE_ID) as HTMLStyleElement | null;

    if (!bgUrl) {
      style?.remove();
      return;
    }

    if (!style) {
      style = document.createElement('style');
      style.id = BG_STYLE_ID;
      document.head.appendChild(style);
    }

    let css: string;
    if (bgMode === 'tile') {
      css = `body { background-image: url("${bgUrl}"); background-repeat: repeat; background-size: auto; }`;
    } else {
      css = `body { background-image: url("${bgUrl}"); background-size: cover; background-repeat: no-repeat; background-position: center; background-attachment: fixed; }`;
    }

    style.textContent = css;

    return () => {
      document.getElementById(BG_STYLE_ID)?.remove();
    };
  }, [theme, bgUrl, bgMode]);
}
