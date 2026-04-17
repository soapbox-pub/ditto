import type { NostrEvent } from "@nostrify/nostrify";
import { useNostr } from "@nostrify/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useAppContext } from "@/hooks/useAppContext";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useEncryptedSettings, setLocalSettingsSync } from "@/hooks/useEncryptedSettings";
import { isSyncDone } from "@/hooks/useInitialSync";
import { parseBlossomServerList } from "@/lib/appBlossom";
import { getStorageKey } from "@/lib/storageKey";
import { ACTIVE_THEME_KIND, parseActiveProfileTheme } from "@/lib/themeEvent";
import type { ThemeConfig } from "@/themes";


/**
 * NostrSync - Syncs user's Nostr data
 *
 * This component runs globally to sync various Nostr data when the user logs in.
 * Currently syncs:
 * - NIP-65 relay list (kind 10002)
 * - BUD-03 Blossom server list (kind 10063)
 * - Encrypted app settings (kind 30078) - theme, feed settings, relay toggle
 * - Active profile theme (kind 16767) - when autoShareTheme is enabled
 */
export function NostrSync() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { config, updateConfig } = useAppContext();
  const queryClient = useQueryClient();
  const {
    settings: encryptedSettings,
    isLoading: settingsLoading,
    recentlyWritten,
  } = useEncryptedSettings();

  // Track the last synced settings timestamp to prevent re-syncing the same data.
  // Seeded to the remote lastSync on first load so that a stale relay event
  // (older than what useInitialSync already applied) does not overwrite local
  // settings after a page reload.
  const lastSyncedTimestamp = useRef<number>(0);
  const [seededTimestamp, setSeededTimestamp] = useState(false);
  const profileThemeSynced = useRef(false);

  // Reset sync state when the user changes (account switch).
  // We keep seededTimestamp=true so the seeding step (which prevents
  // re-applying settings useInitialSync already applied on page load)
  // is skipped. Instead we just reset lastSyncedTimestamp to 0 so
  // the new user's encrypted settings are applied immediately.
  // `accountSwitched` signals to the sync effect that missing fields
  // should be reset to defaults (e.g. theme → "system") rather than
  // left as-is from the previous user.
  const prevPubkey = useRef<string | undefined>(undefined);
  const accountSwitched = useRef(false);
  useEffect(() => {
    const pubkey = user?.pubkey;
    if (prevPubkey.current !== undefined && pubkey !== prevPubkey.current) {
      lastSyncedTimestamp.current = 0;
      profileThemeSynced.current = false;
      accountSwitched.current = true;

      // Clear user-specific query caches on account switch.
      // Remove queries whose keys lack a user pubkey discriminator — these store
      // the previous user's data (reactions, reposts) under keys that would be
      // incorrectly served to the new user.
      const removeKeys = [
        'user-reaction',
        'user-repost',
        'external-user-reaction',
        'external-user-repost',
        'feed',
        'vines-follows',
        'theme-feed',
        'book-feed',
      ];
      for (const key of removeKeys) {
        queryClient.removeQueries({ queryKey: [key] });
      }

      // Invalidate queries that are keyed by user pubkey (they naturally namespace
      // per user, but should be refetched promptly for the new account).
      const invalidateKeys = [
        'encryptedSettings',
        'parsedSettings',
        'notifications',
        'notifications-unread',
        'interests',
        'muteList',
        'muteItems',
        'user-lists',
        'bookmarks',
        'bookmarked-events',
        'custom-emojis',
        'emoji-list',
        'own-follow-packs',
        'follow-list',
        'relayList',
        'blossomServerList',
        'pinned-notes',
        'my-rsvp',
        'user-book-review',
      ];
      for (const key of invalidateKeys) {
        queryClient.invalidateQueries({ queryKey: [key] });
      }
      queryClient.invalidateQueries({ queryKey: ['nostr', 'logins'] });
    }
    prevPubkey.current = pubkey;
  }, [user?.pubkey, queryClient]);

  // Fetch the user's NIP-65 relay list (kind 10002).
  // useInitialSync seeds ['relayList', pubkey] into the cache on first login,
  // so this query resolves from cache without a network round-trip in that case.
  // On subsequent page loads (after sync is done), it fetches once from the relay.
  const { data: relayListEvent } = useQuery<NostrEvent | null>({
    queryKey: ["relayList", user?.pubkey ?? ""],
    queryFn: async ({ signal }) => {
      if (!user) return null;
      const events = await nostr.query(
        [{ kinds: [10002], authors: [user.pubkey], limit: 1 }],
        { signal },
      );
      return events[0] ?? null;
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: 1,
  });

  useEffect(() => {
    if (!relayListEvent) return;

    // Only update if the event is newer than our stored data
    if (relayListEvent.created_at > config.relayMetadata.updatedAt) {
      const fetchedRelays = relayListEvent.tags
        .filter(([name]) => name === "r")
        .map(([, url, marker]) => ({
          url: url.replace(/\/+$/, ""),
          read: !marker || marker === "read",
          write: !marker || marker === "write",
        }));

      if (fetchedRelays.length > 0) {
        console.log("Syncing relay list from Nostr:", fetchedRelays);
        updateConfig((current) => ({
          ...current,
          relayMetadata: {
            relays: fetchedRelays,
            updatedAt: relayListEvent.created_at,
          },
        }));
      }
    }
  }, [relayListEvent, config.relayMetadata.updatedAt, updateConfig]);

  // Fetch the user's BUD-03 Blossom server list (kind 10063).
  // useInitialSync seeds ['blossomServerList', pubkey] into the cache on first login.
  const { data: blossomServerListEvent } = useQuery<NostrEvent | null>({
    queryKey: ["blossomServerList", user?.pubkey ?? ""],
    queryFn: async ({ signal }) => {
      if (!user) return null;
      const events = await nostr.query(
        [{ kinds: [10063], authors: [user.pubkey], limit: 1 }],
        { signal },
      );
      return events[0] ?? null;
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: 1,
  });

  useEffect(() => {
    if (!blossomServerListEvent) return;

    // Only update if the event is newer than our stored data
    if (
      blossomServerListEvent.created_at > config.blossomServerMetadata.updatedAt
    ) {
      const fetchedServers = parseBlossomServerList(blossomServerListEvent);

      if (fetchedServers.length > 0) {
        console.log(
          "Syncing Blossom server list from Nostr (kind 10063):",
          fetchedServers,
        );
        updateConfig((current) => ({
          ...current,
          blossomServerMetadata: {
            servers: fetchedServers,
            updatedAt: blossomServerListEvent.created_at,
          },
        }));
      }
    }
  }, [
    blossomServerListEvent,
    config.blossomServerMetadata.updatedAt,
    updateConfig,
  ]);

  // Sync encrypted settings from Nostr on login
  useEffect(() => {
    if (!user || settingsLoading) return;

    // If this is an account switch and the new user has no encrypted
    // settings at all, reset theme to the app default so the previous
    // user's theme doesn't persist.
    // Skip the reset during a fresh signup (sync not yet done) — the
    // onboarding questionnaire owns theme state until it saves settings.
    if (!encryptedSettings) {
      if (accountSwitched.current) {
        // Only reset theme/sidebar for real account switches, not fresh signups.
        // During signup, isSyncDone returns false and the onboarding
        // questionnaire owns theme state until it saves settings.
        if (isSyncDone(config.appId, user.pubkey)) {
          updateConfig((current) => {
            let changed = false;
            const updates = { ...current };
            if (current.theme !== "system") {
              updates.theme = "system";
              changed = true;
            }
            if (current.customTheme !== undefined) {
              updates.customTheme = undefined;
              changed = true;
            }
            // Reset sidebar order and homepage to the app defaults so the previous
            // user's layout doesn't bleed into the new account.
            if ((current.sidebarOrder ?? []).length > 0) {
              updates.sidebarOrder = [];
              changed = true;
            }
            if (current.homePage !== "feed") {
              updates.homePage = "feed";
              changed = true;
            }
            return changed ? updates : current;
          });
        }
        accountSwitched.current = false;
      }
      return;
    }

    // Get the remote sync timestamp
    const remoteSync = encryptedSettings.lastSync || 0;

    // On first load, mark seeded so this block only runs once.
    // We intentionally do NOT pre-set lastSyncedTimestamp here — leaving it
    // at 0 lets the `remoteSync <= lastSyncedTimestamp` guard below fall
    // through so the settings are actually applied on this first pass.
    // Line 277 then records the timestamp to prevent re-application.
    if (!seededTimestamp) {
      setSeededTimestamp(true);
    }

    // Don't overwrite local config if we just saved settings (short-circuit for
    // the immediate write window, e.g. before the new event propagates back).
    if (recentlyWritten()) {
      console.log("Skipping settings sync - recent write");
      // Advance the cursor so this snapshot is never re-applied once the write
      // window expires and the effect fires again.
      lastSyncedTimestamp.current = remoteSync;
      return;
    }

    // Skip if the remote snapshot is older than what we last applied.
    if (remoteSync <= lastSyncedTimestamp.current) {
      return;
    }

    console.log("Syncing encrypted settings from Nostr", remoteSync);
    lastSyncedTimestamp.current = remoteSync;
    const isSwitch = accountSwitched.current;
    accountSwitched.current = false;

    // Only call updateConfig if something actually changed to avoid
    // unnecessary re-renders of the entire app tree.
    updateConfig((current) => {
      let changed = false;
      const updates = { ...current };

      if (encryptedSettings.theme) {
        if (encryptedSettings.theme !== current.theme) {
          updates.theme = encryptedSettings.theme;
          changed = true;
        }
      } else if (isSwitch) {
        // The new user never saved a theme — reset to app default so
        // the previous user's theme doesn't bleed through.
        if (current.theme !== "system") {
          updates.theme = "system";
          changed = true;
        }
        if (current.customTheme !== undefined) {
          updates.customTheme = undefined;
          changed = true;
        }
      }

      if (
        encryptedSettings.customTheme &&
        JSON.stringify(encryptedSettings.customTheme) !==
          JSON.stringify(current.customTheme)
      ) {
        updates.customTheme = encryptedSettings.customTheme;
        changed = true;
      } else if (
        isSwitch &&
        !encryptedSettings.customTheme &&
        current.customTheme !== undefined
      ) {
        // Clear stale custom theme from the previous account.
        updates.customTheme = undefined;
        changed = true;
      }

      if (
        encryptedSettings.autoShareTheme !== undefined &&
        encryptedSettings.autoShareTheme !== current.autoShareTheme
      ) {
        updates.autoShareTheme = encryptedSettings.autoShareTheme;
        changed = true;
      }

      if (
        encryptedSettings.useAppRelays !== undefined &&
        encryptedSettings.useAppRelays !== current.useAppRelays
      ) {
        updates.useAppRelays = encryptedSettings.useAppRelays;
        changed = true;
      }

      if (encryptedSettings.feedSettings) {
        const currentFeed = current.feedSettings;
        const remoteFeed = encryptedSettings.feedSettings;
        // Check if any feed setting actually differs
        const feedChanged = Object.keys(remoteFeed).some(
          (key) =>
            remoteFeed[key as keyof typeof remoteFeed] !==
            currentFeed?.[key as keyof typeof currentFeed],
        );
        if (feedChanged) {
          updates.feedSettings = { ...currentFeed, ...remoteFeed };
          changed = true;
        }
      }

      if (
        encryptedSettings.contentWarningPolicy &&
        encryptedSettings.contentWarningPolicy !== current.contentWarningPolicy
      ) {
        updates.contentWarningPolicy = encryptedSettings.contentWarningPolicy;
        changed = true;
      }

      if (
        encryptedSettings.sidebarOrder &&
        JSON.stringify(encryptedSettings.sidebarOrder) !==
          JSON.stringify(current.sidebarOrder)
      ) {
        updates.sidebarOrder = encryptedSettings.sidebarOrder;
        changed = true;
      }

      if (
        encryptedSettings.homePage &&
        encryptedSettings.homePage !== current.homePage
      ) {
        updates.homePage = encryptedSettings.homePage;
        changed = true;
      }

      if (
        encryptedSettings.corsProxy &&
        encryptedSettings.corsProxy !== current.corsProxy
      ) {
        updates.corsProxy = encryptedSettings.corsProxy;
        changed = true;
      }

      if (
        encryptedSettings.faviconUrl &&
        encryptedSettings.faviconUrl !== current.faviconUrl
      ) {
        updates.faviconUrl = encryptedSettings.faviconUrl;
        changed = true;
      }

      if (
        encryptedSettings.linkPreviewUrl &&
        encryptedSettings.linkPreviewUrl !== current.linkPreviewUrl
      ) {
        updates.linkPreviewUrl = encryptedSettings.linkPreviewUrl;
        changed = true;
      }

      // Return the same reference if nothing changed to prevent re-render
      return changed ? updates : current;
    });

    // Sync feed tab settings (stored directly in localStorage, not AppConfig)
    if (encryptedSettings.showGlobalFeed !== undefined) {
      const key = getStorageKey(config.appId, "showGlobalFeed");
      const current = localStorage.getItem(key);
      const incoming = String(encryptedSettings.showGlobalFeed);
      if (current !== incoming) {
        localStorage.setItem(key, incoming);
      }
    }
    if (encryptedSettings.showCommunityFeed !== undefined) {
      const key = getStorageKey(config.appId, "showCommunityFeed");
      const current = localStorage.getItem(key);
      const incoming = String(encryptedSettings.showCommunityFeed);
      if (current !== incoming) {
        localStorage.setItem(key, incoming);
      }
    }
    if (encryptedSettings.communityData) {
      const community = {
        domain: encryptedSettings.communityData.domain,
        label: encryptedSettings.communityData.label,
        userCount: encryptedSettings.communityData.userCount,
      };
      const communityKey = getStorageKey(config.appId, "community");
      const currentRaw = localStorage.getItem(communityKey);
      const incoming = JSON.stringify(community);
      if (currentRaw !== incoming) {
        localStorage.setItem(communityKey, incoming);
        localStorage.setItem(
          getStorageKey(config.appId, "communityData"),
          JSON.stringify({ names: encryptedSettings.communityData.nip05 }),
        );
      }
    }

    // Persist the sync timestamp so the next page load can render immediately
    // from localStorage without showing the spinner.
    if (user && remoteSync > 0) {
      setLocalSettingsSync(user.pubkey, remoteSync);
    }
  }, [
    user,
    encryptedSettings,
    settingsLoading,
    updateConfig,
    recentlyWritten,
    seededTimestamp,
    config.appId,
  ]);

  // Sync active profile theme (kind 16767) on pageload when autoShareTheme is enabled.
  // This pulls in the user's published theme and applies it as the customTheme
  // without changing the actual theme mode (light/dark/system/custom).
  // NOTE: ref is declared near the top of the component so the user-change
  // reset effect can clear it. See the prevPubkey effect above.

  useEffect(() => {
    if (!user || !config.autoShareTheme) return;
    if (profileThemeSynced.current) return;
    profileThemeSynced.current = true;

    const controller = new AbortController();

    const syncProfileTheme = async () => {
      try {
        const events = await nostr.query(
          [{ kinds: [ACTIVE_THEME_KIND], authors: [user.pubkey], limit: 1 }],
          { signal: controller.signal },
        );

        if (events.length === 0) return;

        const parsed = parseActiveProfileTheme(events[0]);
        if (!parsed) return;

        // Convert ActiveProfileTheme to ThemeConfig
        const remoteTheme: ThemeConfig = {
          colors: parsed.colors,
          ...(parsed.font && { font: parsed.font }),
          ...(parsed.titleFont && { titleFont: parsed.titleFont }),
          ...(parsed.background && { background: parsed.background }),
        };

        // Update customTheme if it differs from what we have locally.
        // Do NOT change the `theme` value — leave it as light/dark/system/custom.
        updateConfig((current) => {
          if (
            JSON.stringify(current.customTheme) === JSON.stringify(remoteTheme)
          ) {
            return current;
          }
          return { ...current, customTheme: remoteTheme };
        });
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return;
        console.error("Failed to sync active profile theme:", error);
      }
    };

    syncProfileTheme();

    return () => controller.abort();
  }, [user, config.autoShareTheme, nostr, updateConfig]);

  return null;
}
