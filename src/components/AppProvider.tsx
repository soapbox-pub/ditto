import { ReactNode, useLayoutEffect } from 'react';
import { z } from 'zod';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { AppContext, type AppConfig, type AppContextType, type Theme, type RelayMetadata } from '@/contexts/AppContext';
import { builtinThemes, themePresets, buildThemeCssFromCore, coreToTokens, buildThemeCss, resolveTheme, type CoreThemeColors } from '@/themes';
import { ThemeSchemaCompat, ThemeColorsCompatSchema, FeedSettingsSchema, ContentWarningPolicySchema } from '@/lib/schemas';

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
 * Accepts both CoreThemeColors and legacy ThemeTokens format,
 * normalizing to CoreThemeColors.
 */
const CustomThemeStorageSchema = ThemeColorsCompatSchema;

// Zod schema for AppConfig validation.
// Uses ThemeSchemaCompat so legacy "black"/"pink" values parse successfully.
// Migration to "custom" happens in the deserializer below.
const AppConfigSchema = z.object({
  theme: ThemeSchemaCompat,
  customTheme: CustomThemeStorageSchema.optional(),
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
          result.customTheme = themePresets[legacyTheme].colors;
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
  useApplyTheme(config.theme, config.customTheme);

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
 */
function useApplyTheme(theme: Theme, customTheme: CoreThemeColors | undefined) {
  useLayoutEffect(() => {
    function apply() {
      const resolved = resolveTheme(theme);
      let css: string;

      if (resolved === 'custom') {
        // Use custom theme colors, falling back to dark if not yet set
        const colors = customTheme ?? builtinThemes.dark;
        css = buildThemeCssFromCore(colors);
      } else {
        css = buildThemeCss(coreToTokens(builtinThemes[resolved]));
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
  }, [theme, customTheme]);
}
