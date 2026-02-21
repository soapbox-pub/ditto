import { ReactNode, useEffect } from 'react';
import { z } from 'zod';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { AppContext, type AppConfig, type AppContextType, type Theme, type RelayMetadata } from '@/contexts/AppContext';

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

// Zod schema for FeedSettings validation.
// All fields use .optional() so localStorage data with missing keys
// (from older encrypted settings) doesn't reject the whole object.
// .passthrough() preserves extra keys from newer encrypted settings.
// Missing fields get filled in by the defaultConfig merge in line below.
const FeedSettingsSchema = z.object({
  feedIncludePosts: z.boolean().optional(),
  feedIncludeReposts: z.boolean().optional(),
  feedIncludeArticles: z.boolean().optional(),
  showArticles: z.boolean().optional(),
  showVines: z.boolean().optional(),
  showPolls: z.boolean().optional(),
  showTreasures: z.boolean().optional(),
  showTreasureGeocaches: z.boolean().optional(),
  showTreasureFoundLogs: z.boolean().optional(),
  showColors: z.boolean().optional(),
  showPacks: z.boolean().optional(),
  showStreams: z.boolean().optional(),
  feedIncludeVines: z.boolean().optional(),
  feedIncludePolls: z.boolean().optional(),
  feedIncludeTreasureGeocaches: z.boolean().optional(),
  feedIncludeTreasureFoundLogs: z.boolean().optional(),
  feedIncludeColors: z.boolean().optional(),
  feedIncludePacks: z.boolean().optional(),
  feedIncludeStreams: z.boolean().optional(),
  showDecks: z.boolean().optional(),
  feedIncludeDecks: z.boolean().optional(),
}).passthrough();

// Zod schema for AppConfig validation
const AppConfigSchema = z.object({
  theme: z.enum(['dark', 'light', 'black', 'pink']),
  relayMetadata: RelayMetadataSchema,
  useAppRelays: z.boolean(),
  feedSettings: FeedSettingsSchema,
  nip85StatsPubkey: z.string().refine(
    (val) => val.length === 0 || (val.length === 64 && /^[0-9a-f]{64}$/i.test(val)),
    { message: 'Must be empty or a valid 64-character hex pubkey' }
  ),
  nip85OnlyMode: z.boolean(),
  blossomServers: z.array(z.url()),
  defaultZapComment: z.string(),
  faviconUrl: z.string(),
  linkPreviewUrl: z.string(),
  corsProxy: z.string(),
  contentWarningPolicy: z.enum(['blur', 'hide', 'show']),
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
  useApplyTheme(config.theme);

  return (
    <AppContext.Provider value={appContextValue}>
      {children}
    </AppContext.Provider>
  );
}

/**
 * Hook to apply theme changes to the document root
 */
function useApplyTheme(theme: Theme) {
  useEffect(() => {
    const root = window.document.documentElement;

    // Just apply the theme instantly - no transitions, no RAF
    root.classList.remove('dark', 'light', 'black', 'pink');
    root.classList.add(theme);
  }, [theme]);
}