import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createHead, UnheadProvider } from '@unhead/react/client';
import { BrowserRouter } from 'react-router-dom';
import { NostrLoginProvider } from '@nostrify/react/login';
import NostrProvider from '@/components/NostrProvider';
import { AppProvider } from '@/components/AppProvider';
import { NWCProvider } from '@/contexts/NWCContext';
import { AppConfig } from '@/contexts/AppContext';

interface TestAppProps {
  children: React.ReactNode;
}

export function TestApp({ children }: TestAppProps) {
  const head = createHead();

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  const defaultConfig: AppConfig = {
    appName: 'Ditto',
    appId: 'ditto',
    homePage: 'feed',
    theme: 'light',
    autoShareTheme: true,
    useAppRelays: true,
    relayMetadata: {
      relays: [
        { url: 'wss://relay.primal.net', read: true, write: true },
      ],
      updatedAt: 0,
    },
    feedSettings: {
      feedIncludePosts: true,
      feedIncludeReposts: true,
      feedIncludeArticles: false,
      showArticles: false,
      showEvents: false,
      feedIncludeEvents: false,
      showVines: true,
      showPolls: false,
      showTreasures: false,
      showTreasureGeocaches: true,
      showTreasureFoundLogs: true,
      showColors: false,
      showPacks: true,
      feedIncludeVines: false,
      feedIncludePolls: false,
      feedIncludeTreasureGeocaches: false,
      feedIncludeTreasureFoundLogs: false,
      feedIncludeColors: false,
      feedIncludePacks: false,
      showDecks: false,
      feedIncludeDecks: false,
      showWebxdc: false,
      feedIncludeWebxdc: false,
      showProfileThemes: false,
      feedIncludeProfileThemes: true,
      showThemeDefinitions: true,
      feedIncludeThemeDefinitions: true,
      showProfileThemeUpdates: true,
      feedIncludeProfileThemeUpdates: true,
      showCustomProfileThemes: true,
      feedIncludeVoiceMessages: false,
      showCustomEmojis: true,
      showEmojiPacks: false,
      feedIncludeEmojiPacks: false,
      showPhotos: true,
      feedIncludePhotos: true,
      showVideos: true,
      feedIncludeNormalVideos: true,
      feedIncludeShortVideos: true,
      showUserStatuses: true,
      showMusic: false,
      feedIncludeMusicTracks: false,
      feedIncludeMusicPlaylists: false,
      showPodcasts: false,
      feedIncludePodcastEpisodes: false,
      feedIncludePodcastTrailers: false,
      showBadges: false,
      showBadgeDefinitions: true,
      showProfileBadges: true,
      feedIncludeBadgeDefinitions: false,
      feedIncludeProfileBadges: false,
      followsFeedShowReplies: true,
    },
    sidebarOrder: [],
    nip85StatsPubkey: '5f68e85ee174102ca8978eef302129f081f03456c884185d5ec1c1224ab633ea',
    blossomServers: ['https://blossom.ditto.pub/', 'https://blossom.dreamith.to/', 'https://blossom.primal.net/'],
    faviconUrl: 'https://fetch.ditto.pub/favicon/{hostname}',
    linkPreviewUrl: 'https://fetch.ditto.pub/link/{url}',
    corsProxy: 'https://proxy.shakespeare.diy/?url={href}',
    magicMouse: false,
    contentWarningPolicy: 'blur',
    sentryDsn: '',
    sentryEnabled: false,
    plausibleDomain: '',
    plausibleEndpoint: '',
    savedFeeds: [],
  };

  return (
    <UnheadProvider head={head}>
      <AppProvider storageKey='test-app-config' defaultConfig={defaultConfig}>
        <QueryClientProvider client={queryClient}>
          <NostrLoginProvider storageKey='test-login'>
            <NostrProvider>
              <NWCProvider>
                <BrowserRouter>
                  {children}
                </BrowserRouter>
              </NWCProvider>
            </NostrProvider>
          </NostrLoginProvider>
        </QueryClientProvider>
      </AppProvider>
    </UnheadProvider>
  );
}

export default TestApp;