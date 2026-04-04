// NOTE: This file should normally not be modified unless you are adding a new provider.
// To add new routes, edit the AppRouter.tsx file.

import { Capacitor } from "@capacitor/core";
import { StatusBar, Style } from "@capacitor/status-bar";
import { NostrLoginProvider } from "@nostrify/react/login";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { InferSeoMetaPlugin } from "@unhead/addons";
import { createHead, UnheadProvider } from "@unhead/react/client";
import { useEffect } from "react";
import { AppProvider } from "@/components/AppProvider";
import { DMProvider, type DMConfig } from "@/components/DMProvider";
import { InitialSyncGate } from "@/components/InitialSyncGate";
import { NativeNotifications } from "@/components/NativeNotifications";
import NostrProvider from "@/components/NostrProvider";
import { NostrSync } from "@/components/NostrSync";
import { PlausibleProvider } from "@/components/PlausibleProvider";
import { SentryProvider } from "@/components/SentryProvider";


import { TooltipProvider } from "@/components/ui/tooltip";
import { useNsecPasteGuard } from "@/hooks/useNsecPasteGuard";
import type { AppConfig } from "@/contexts/AppContext";
import { NWCProvider } from "@/contexts/NWCContext";
import { PROTOCOL_MODE } from "@/lib/dmConstants";
import { DittoConfigSchema, type DittoConfig } from "@/lib/schemas";
import { EmotionDevProvider } from "@/blobbi/dev/EmotionDevContext";
import AppRouter from "./AppRouter";

const dmConfig: DMConfig = {
  enabled: false,
  protocolMode: PROTOCOL_MODE.NIP04_OR_NIP17,
};

const head = createHead({
  plugins: [InferSeoMetaPlugin()],
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 60000, // 1 minute
      gcTime: 300000, // 5 minutes
    },
  },
});

/** Hardcoded fallback values. Always provides every required field. */
const hardcodedConfig: AppConfig = {
  appName: "Ditto",
  appId: "ditto",
  homePage: "feed",
  client: "naddr1qvzqqqru7cpzq7q6z5ns2hm5c8msyv83qwzxpxe52j8c4d4q5m92wsp9sflelkh9qqzkg6t5w3hswjl4yp",
  magicMouse: false,
  theme: "system",
  autoShareTheme: true,
  useAppRelays: true,
  relayMetadata: {
    relays: [],
    updatedAt: 0,
  },
  feedSettings: {
    feedIncludePosts: true,
    feedIncludeComments: true,
    feedIncludeReposts: true,
    feedIncludeGenericReposts: true,
    feedIncludeArticles: true,
    showArticles: true,
    showEvents: true,
    feedIncludeEvents: true,
    showVines: true,
    showPolls: true,
    showTreasures: true,
    showTreasureGeocaches: true,
    showTreasureFoundLogs: true,
    showColors: true,
    showPacks: true,
    feedIncludeVines: true,
    feedIncludePolls: true,
    feedIncludeTreasureGeocaches: true,
    feedIncludeTreasureFoundLogs: true,
    feedIncludeColors: true,
    feedIncludePacks: true,
    showDecks: true,
    feedIncludeDecks: true,
    showWebxdc: true,
    feedIncludeWebxdc: true,
    showPhotos: true,
    feedIncludePhotos: true,
    showVideos: true,
    feedIncludeNormalVideos: true,
    feedIncludeShortVideos: true,
    showProfileThemes: false,
    feedIncludeProfileThemes: true,
    showThemeDefinitions: true,
    feedIncludeThemeDefinitions: true,
    showProfileThemeUpdates: true,
    feedIncludeProfileThemeUpdates: true,
    showCustomProfileThemes: true,
    feedIncludeVoiceMessages: true,
    showEmojiPacks: true,
    feedIncludeEmojiPacks: true,
    showCustomEmojis: true,
    showUserStatuses: true,
    showMusic: true,
    feedIncludeMusicTracks: true,
    feedIncludeMusicPlaylists: true,
    showPodcasts: true,
    feedIncludePodcastEpisodes: true,
    feedIncludePodcastTrailers: true,
    showDevelopment: true,
    feedIncludeDevelopment: true,
    showBadges: true,
    showBadgeDefinitions: true,
    showProfileBadges: true,
    feedIncludeBadgeDefinitions: true,
    feedIncludeProfileBadges: true,
    feedIncludeVanish: true,
    feedIncludeBlobbi: true,
    followsFeedShowReplies: true,
  },
  sidebarOrder: [
    "feed",
    "notifications",
    "search",
    "blobbi",
    "badges",
    "emojis",
    "letters",
    "themes",
    "settings",
    "help",
  ],
  nip85StatsPubkey:
    "5f68e85ee174102ca8978eef302129f081f03456c884185d5ec1c1224ab633ea",
  blossomServerMetadata: {
    servers: [],
    updatedAt: 0,
  },
  useAppBlossomServers: true,
  faviconUrl: "https://ditto.pub/api/favicon/{hostname}",
  linkPreviewUrl: "https://ditto.pub/api/link-preview/{url}",
  corsProxy: "https://proxy.shakespeare.diy/?url={href}",
  contentWarningPolicy: "blur",
  sentryDsn: import.meta.env.VITE_SENTRY_DSN || "",
  sentryEnabled: true,
  plausibleDomain: import.meta.env.VITE_PLAUSIBLE_DOMAIN || "",
  plausibleEndpoint: import.meta.env.VITE_PLAUSIBLE_ENDPOINT || "",
  savedFeeds: [],
  imageQuality: 'compressed',
};

/**
 * Parse and validate build-time ditto.json overrides from the env string.
 * Returns an empty object when no config file was provided or validation fails.
 */
function parseDittoConfig(): DittoConfig {
  try {
    const json = JSON.parse(import.meta.env.DITTO_CONFIG);
    if (!json) return {};
    return DittoConfigSchema.parse(json);
  } catch {
    return {};
  }
}

/**
 * Merge hardcoded defaults with build-time ditto.json overrides.
 * Deep-merges feedSettings so a partial override doesn't erase defaults.
 * Precedence (handled by AppProvider): user localStorage > build-time > hardcoded.
 */
const dittoConfig = parseDittoConfig();
const defaultConfig: AppConfig = {
  ...hardcodedConfig,
  ...dittoConfig,
  feedSettings: { ...hardcodedConfig.feedSettings, ...dittoConfig.feedSettings },
};

export function App() {
  useNsecPasteGuard();

  useEffect(() => {
    // Initialize StatusBar for mobile apps
    if (Capacitor.isNativePlatform()) {
      StatusBar.setStyle({ style: Style.Dark }).catch(() => {
        // StatusBar may not be available on all platforms
      });
      StatusBar.setOverlaysWebView({ overlay: true }).catch(() => {
        // Ignore errors on unsupported platforms
      });
    }
  }, []);

  return (
    <UnheadProvider head={head}>
      <AppProvider storageKey="nostr:app-config" defaultConfig={defaultConfig}>
        <SentryProvider>
          <PlausibleProvider>
            <QueryClientProvider client={queryClient}>
              <NostrLoginProvider storageKey="nostr:login">
                <NostrProvider>
                  <NostrSync />
                  <NativeNotifications />

                    <NWCProvider>
                    <DMProvider config={dmConfig}>
                      <EmotionDevProvider>
                        <TooltipProvider>
                          <InitialSyncGate>
                            <AppRouter />
                          </InitialSyncGate>
                        </TooltipProvider>
                      </EmotionDevProvider>
                    </DMProvider>
                  </NWCProvider>
                </NostrProvider>
              </NostrLoginProvider>
            </QueryClientProvider>
          </PlausibleProvider>
        </SentryProvider>
      </AppProvider>
    </UnheadProvider>
  );
}

export default App;
