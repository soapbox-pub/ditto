import { useRef } from 'react';
import { useNostr } from '@nostrify/react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { NostrFilter } from '@nostrify/nostrify';

import { useAppContext } from '@/hooks/useAppContext';
import { useCurrentUser } from './useCurrentUser';
import type { Theme, FeedSettings, ContentWarningPolicy, SavedFeed } from '@/contexts/AppContext';
import type { ThemeConfig } from '@/themes';
import type { ContentFilter } from './useContentFilters';
import type { LetterPreferences } from '@/lib/letterTypes';
import { EncryptedSettingsSchema } from '@/lib/schemas';

/**
 * Timestamp (ms) of last local encrypted-settings write this session.
 * NostrSync uses this to avoid overwriting a local edit with a stale relay event.
 */
let lastWriteTs: number = 0;

/**
 * Complete encrypted app settings stored in NIP-78
 */
export interface EncryptedSettings {
  /** App theme preference */
  theme?: Theme;
  /** Custom theme config (colors, fonts, background) */
  customTheme?: ThemeConfig;
  /** Automatically publish custom theme changes to profile */
  autoShareTheme?: boolean;
  /** Whether to use app default relays in addition to user relays */
  useAppRelays?: boolean;
  /** Feed and sidebar content settings */
  feedSettings?: FeedSettings;
  /** Advanced content filters */
  contentFilters?: ContentFilter[];
  /** How to handle NIP-36 content-warning events */
  contentWarningPolicy?: ContentWarningPolicy;
  /** Whether the user has enabled push notifications */
  notificationsEnabled?: boolean;
  /** Timestamp of last viewed notification (Unix timestamp in seconds) */
  notificationsCursor?: number;
  /** Per-type notification preferences (all default to true/enabled) */
  notificationPreferences?: {
    reactions?: boolean;
    reposts?: boolean;
    zaps?: boolean;
    mentions?: boolean;
    comments?: boolean;
    badges?: boolean;
    onlyFollowing?: boolean;
  };
  /** Last sync timestamp */
  lastSync?: number;
  /** Ordered list of sidebar item IDs (built-in + extra-kind) */
  sidebarOrder?: string[];
  /** Sidebar item ID to display on the homepage ("/") */
  homePage?: string;
  /** Whether the Global feed tab is shown */
  showGlobalFeed?: boolean;
  /** Whether the Community feed tab is shown */
  showCommunityFeed?: boolean;
  /** Community data: domain, label, user count, and NIP-05 JSON */
  communityData?: {
    domain: string;
    label: string;
    userCount: number;
    nip05: Record<string, unknown>;
  };
  /** Custom CORS proxy URI template (only synced when non-empty) */
  corsProxy?: string;
  /** Custom favicon URI template (only synced when non-empty) */
  faviconUrl?: string;
  /** Custom link preview URI template (only synced when non-empty) */
  linkPreviewUrl?: string;
  /** Sentry DSN for error reporting (empty string = disabled) */
  sentryDsn?: string;
  /** Saved feed tabs created from the search page. */
  savedFeeds?: SavedFeed[];
  /** Letter preferences (stationery, font, frame, closing, signature, inbox filters) */
  letterPreferences?: LetterPreferences;
}

/**
 * Hook to manage all encrypted app settings using NIP-78 (kind 30078)
 * Syncs settings across devices while keeping them private
 */
export function useEncryptedSettings() {
  const { config } = useAppContext();
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const queryClient = useQueryClient();



  // Query the encrypted settings event
  const query = useQuery({
    queryKey: ['encryptedSettings', user?.pubkey],
    queryFn: async () => {
      if (!user) return null;

      const filter: NostrFilter = {
        kinds: [30078],
        authors: [user.pubkey],
        '#d': [`${config.appId}/metadata`],
        limit: 1,
      };

      const events = await nostr.query([filter]);
      if (events.length === 0) return null;

      return events[0];
    },
    enabled: !!user,
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  // Parse settings from encrypted content
  const settings = useQuery({
    queryKey: ['parsedSettings', query.data?.id],
    queryFn: async () => {
      const event = query.data;
      if (!event || !user) return null;

      // Decrypt the content
      if (!event.content || !user.signer.nip44) {
        return null;
      }

      try {
        const decrypted = await user.signer.nip44.decrypt(user.pubkey, event.content);
        const json = JSON.parse(decrypted);
        const result = EncryptedSettingsSchema.safeParse(json);
        if (!result.success) {
          console.warn('Encrypted settings failed validation, using partial data:', result.error.issues);
          // Return whatever fields are valid rather than wiping everything
          return (json ?? {}) as EncryptedSettings;
        }
        return result.data as EncryptedSettings;
      } catch (error) {
        console.error('Failed to decrypt settings:', error);
        return null;
      }
    },
    enabled: !!query.data && !!user,
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  // Tracks the latest optimistic settings so rapid successive mutations
  // don't overwrite each other by reading stale cache data.
  const pendingSettings = useRef<EncryptedSettings | null>(null);

  // Update settings
  const updateSettings = useMutation({
    mutationFn: async (patch: Partial<EncryptedSettings>) => {
      if (!user) throw new Error('User not logged in');
      if (!user.signer.nip44) throw new Error('NIP-44 encryption not supported by signer');

      // Use the latest pending settings if available, otherwise fall back to cache.
      const currentSettings = pendingSettings.current ?? settings.data ?? {};
      const updatedSettings: EncryptedSettings = {
        ...currentSettings,
        ...patch,
        lastSync: Date.now(),
      };

      // Optimistically track so the next rapid mutation sees this state immediately
      pendingSettings.current = updatedSettings;

      // Encrypt the settings
      const plaintext = JSON.stringify(updatedSettings);
      const encrypted = await user.signer.nip44.encrypt(user.pubkey, plaintext);

      // Sign the event
      const unsignedEvent = {
        kind: 30078,
        content: encrypted,
        tags: [
          ['d', `${config.appId}/metadata`],
          ['title', `${config.appName} Metadata`],
          ['client', config.appName, ...(config.client ? [config.client] : [])],
        ],
        created_at: Math.floor(Date.now() / 1000),
      };

      const signedEvent = await user.signer.signEvent(unsignedEvent);

      // Mark that we just wrote, so NostrSync doesn't fight us.
      lastWriteTs = Date.now();

      // Publish in background
      nostr.event(signedEvent, { signal: AbortSignal.timeout(5000) }).catch((error) => {
        console.error('Failed to publish encrypted settings:', error);
      });

      return { updatedSettings, signedEvent };
    },
    // Update cache in-place instead of refetching, which avoids
    // NostrSync re-running and causing a re-render loop.
    // Do NOT invalidate the encryptedSettings query here — doing so triggers a
    // relay refetch that can return the old event before the new one propagates,
    // which causes NostrSync to overwrite the theme the user just selected.
    //
    // Use the signed event's ID (not the old query event ID) so the parsed
    // settings cache entry is keyed correctly and NostrSync picks it up.
    onSuccess: ({ updatedSettings, signedEvent }) => {
      queryClient.setQueryData(['encryptedSettings', user?.pubkey], signedEvent);
      queryClient.setQueryData(['parsedSettings', signedEvent.id], updatedSettings);
      // Cache is now up to date — pending ref no longer needed
      pendingSettings.current = null;
    },
  });

  // Initialize settings if they don't exist
  const initializeSettings = async (initialSettings: Partial<EncryptedSettings>) => {
    if (settings.data !== null || !user?.signer.nip44) {
      return; // Already initialized or no encryption support
    }

    try {
      await updateSettings.mutateAsync(initialSettings);
    } catch (error) {
      console.warn('Failed to initialize encrypted settings:', error);
    }
  };

  return {
    settings: settings.data,
    isLoading: query.isLoading || settings.isLoading,
    isError: query.isError || settings.isError,
    error: query.error || settings.error,
    updateSettings,
    initializeSettings,
    hasNip44Support: !!user?.signer.nip44,
    lastSync: settings.data?.lastSync,
    /** True if a local write happened recently. NostrSync should skip applying. */
    recentlyWritten: () => Date.now() - lastWriteTs < 10_000,
  };
}
