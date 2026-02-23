// NOTE: This file should normally not be modified unless you are adding a new provider.
// To add new routes, edit the AppRouter.tsx file.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createHead, UnheadProvider } from '@unhead/react/client';
import { InferSeoMetaPlugin } from '@unhead/addons';
import { useEffect } from 'react';
import NostrProvider from '@/components/NostrProvider';
import { NostrSync } from '@/components/NostrSync';
import { NativeNotifications } from '@/components/NativeNotifications';
import { InitialSyncGate } from '@/components/InitialSyncGate';
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { NostrLoginProvider } from '@nostrify/react/login';
import { AppProvider } from '@/components/AppProvider';
import { NWCProvider } from '@/contexts/NWCContext';
import { AppConfig } from '@/contexts/AppContext';
import AppRouter from './AppRouter';
import { StatusBar, Style } from '@capacitor/status-bar';
import { Capacitor } from '@capacitor/core';

const head = createHead({
  plugins: [
    InferSeoMetaPlugin(),
  ],
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

const defaultConfig: AppConfig = {
  theme: "dark",
  useAppRelays: true,
  relayMetadata: {
    relays: [],
    updatedAt: 0,
  },
  feedSettings: {
    feedIncludePosts: true,
    feedIncludeReposts: true,
    feedIncludeArticles: false,
    showArticles: false,
    showVines: true,
    showPolls: false,
    showTreasures: false,
    showTreasureGeocaches: true,
    showTreasureFoundLogs: true,
    showColors: false,
    showPacks: true,
    showStreams: true,
    feedIncludeVines: false,
    feedIncludePolls: false,
    feedIncludeTreasureGeocaches: false,
    feedIncludeTreasureFoundLogs: false,
    feedIncludeColors: false,
    feedIncludePacks: false,
    feedIncludeStreams: false,
    showDecks: false,
    feedIncludeDecks: false,
  },
  blossomServers: ['https://blossom.ditto.pub/', 'https://blossom.dreamith.to/', 'https://blossom.primal.net/'],
  defaultZapComment: 'Zapped with Ditto!',
  faviconUrl: 'https://fetch.ditto.pub/favicon/{hostname}',
  linkPreviewUrl: 'https://fetch.ditto.pub/link/{url}',
  corsProxy: 'https://proxy.shakespeare.diy/?url={href}',
  contentWarningPolicy: 'blur',
};

export function App() {
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
        <QueryClientProvider client={queryClient}>
          <NostrLoginProvider storageKey='nostr:login'>
            <NostrProvider>
              <NostrSync />
              <NativeNotifications />
              <NWCProvider>
                <TooltipProvider>
                  <Toaster />
                  <InitialSyncGate>
                    <AppRouter />
                  </InitialSyncGate>
                </TooltipProvider>
              </NWCProvider>
            </NostrProvider>
          </NostrLoginProvider>
        </QueryClientProvider>
      </AppProvider>
    </UnheadProvider>
  );
}

export default App;
