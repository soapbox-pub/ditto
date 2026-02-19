import { ReactNode, useEffect } from 'react';
import { z } from 'zod';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { AppContext, type AppConfig, type AppContextType, type Theme, type RelayMetadata, type FeedSettings } from '@/contexts/AppContext';

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

// Zod schema for FeedSettings validation
const FeedSettingsSchema = z.object({
  showVines: z.boolean(),
  showPolls: z.boolean(),
  showTreasures: z.boolean(),
  showTreasureGeocaches: z.boolean(),
  showTreasureFoundLogs: z.boolean(),
  showColors: z.boolean(),
  showPacks: z.boolean(),
  feedIncludeVines: z.boolean(),
  feedIncludePolls: z.boolean(),
  feedIncludeTreasureGeocaches: z.boolean(),
  feedIncludeTreasureFoundLogs: z.boolean(),
  feedIncludeColors: z.boolean(),
  feedIncludePacks: z.boolean(),
}) satisfies z.ZodType<FeedSettings>;

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
  statsMode: z.enum(['nip85-only', 'manual-only', 'both']),
}) satisfies z.ZodType<AppConfig>;

export function AppProvider(props: AppProviderProps) {
  const {
    children,
    storageKey,
    defaultConfig,
  } = props;

  // App configuration state with localStorage persistence
  const [rawConfig, setConfig] = useLocalStorage<Partial<AppConfig>>(
    storageKey,
    {},
    {
      serialize: JSON.stringify,
      deserialize: (value: string) => {
        const parsed = JSON.parse(value);
        return AppConfigSchema.partial().parse(parsed);
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