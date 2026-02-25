import { ReactNode, useEffect } from 'react';
import { z } from 'zod';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { AppContext, type AppConfig, type AppContextType, type Theme, type RelayMetadata } from '@/contexts/AppContext';
import { themes, buildThemeCss, type ThemeTokens } from '@/themes';
import { isDarkTheme } from '@/lib/colorUtils';
import { ThemeSchema, CustomThemeSchema, FeedSettingsSchema, ContentWarningPolicySchema } from '@/lib/schemas';

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

// Zod schema for AppConfig validation
const AppConfigSchema = z.object({
  theme: ThemeSchema,
  customTheme: CustomThemeSchema.optional(),
  relayMetadata: RelayMetadataSchema,
  useAppRelays: z.boolean(),
  feedSettings: FeedSettingsSchema,
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
 * For custom themes, uses user-defined tokens. Also sets the `dark` class on
 * <html> based on background luminance so that third-party components and
 * `dark:` Tailwind variants work correctly.
 */
function useApplyTheme(theme: Theme, customTheme?: ThemeTokens) {
  useEffect(() => {
    let tokens: ThemeTokens;
    if (theme === 'custom' && customTheme) {
      tokens = customTheme;
    } else if (theme === 'custom') {
      // Custom selected but no tokens defined yet — fall back to dark
      tokens = themes.dark;
    } else {
      tokens = themes[theme as Exclude<Theme, 'custom'>] ?? themes.dark;
    }

    const css = buildThemeCss(tokens);

    let el = document.getElementById('theme-vars') as HTMLStyleElement | null;
    if (!el) {
      el = document.createElement('style');
      el.id = 'theme-vars';
      document.head.appendChild(el);
    }
    el.textContent = css;

    // Set the dark/light class on <html> based on background luminance.
    // This ensures dark: Tailwind variants and third-party components
    // (e.g. emoji picker) respond correctly to any custom theme.
    const dark = isDarkTheme(tokens.background);
    document.documentElement.classList.toggle('dark', dark);
    document.documentElement.classList.toggle('light', !dark);

    // Now that CSS variables are set, the inline body background from
    // theme.js is no longer needed — bg-background will resolve correctly.
    document.body.removeAttribute('style');
  }, [theme, customTheme]);
}