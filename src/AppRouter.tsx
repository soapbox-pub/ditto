import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { getExtraKindDef } from "./lib/extraKinds";
import { sidebarItemIcon } from "@/lib/sidebarItems";
import { ScrollToTop } from "./components/ScrollToTop";
import { MainLayout } from "./components/MainLayout";
import { useCurrentUser } from "./hooks/useCurrentUser";
import { useProfileUrl } from "./hooks/useProfileUrl";
import { AudioPlayerProvider } from "@/contexts/AudioPlayerContext";
import { MinimizedAudioBar } from "@/components/MinimizedAudioBar";
import { AudioNavigationGuard } from "@/components/AudioNavigationGuard";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import { HomePage } from "./pages/HomePage";
import { NIP19Page } from "./pages/NIP19Page";
import { NotificationsPage } from "./pages/NotificationsPage";
import { SearchPage } from "./pages/SearchPage";
import { TrendsPage } from "./pages/TrendsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { ProfileSettings } from "./pages/ProfileSettings";
import { ContentSettingsPage } from "./pages/ContentSettingsPage";
import { ContentPage } from "./pages/ContentPage";
import { WalletSettingsPage } from "./pages/WalletSettingsPage";
import { NotificationSettings } from "./pages/NotificationSettings";
import { AdvancedSettingsPage } from "./pages/AdvancedSettingsPage";
import { MagicSettingsPage } from "./pages/MagicSettingsPage";
import { NetworkSettingsPage } from "./pages/NetworkSettingsPage";
import { HashtagPage } from "./pages/HashtagPage";
import { DomainFeedPage } from "./pages/DomainFeedPage";
import { BookmarksPage } from "./pages/BookmarksPage";
import { KindFeedPage } from "./pages/KindFeedPage";
import { VideosFeedPage } from "./pages/VideosFeedPage";
import { PhotosFeedPage } from "./pages/PhotosFeedPage";
import { VinesFeedPage } from "./pages/VinesFeedPage";
import { EventsFeedPage } from "./pages/EventsFeedPage";
import { WebxdcFeedPage } from "./pages/WebxdcFeedPage";
import { TreasuresPage } from "./pages/TreasuresPage";
import { ThemesPage } from "./pages/ThemesPage";
import { ExternalContentPage } from "./pages/ExternalContentPage";
import { AIChatPage } from "./pages/AIChatPage";
import { WorldPage } from "./pages/WorldPage";
import { MusicFeedPage } from "./pages/MusicFeedPage";
import { PodcastsFeedPage } from "./pages/PodcastsFeedPage";
import { BooksPage } from "./pages/BooksPage";


const pollsDef = getExtraKindDef('polls')!;
const colorsDef = getExtraKindDef('colors')!;
const packsDef = getExtraKindDef('packs')!;
const articlesDef = getExtraKindDef('articles')!;
const decksDef = getExtraKindDef('decks')!;
const emojisDef = getExtraKindDef('emojis')!;

/** Redirects /profile to the user's canonical profile URL (nip05 or npub). */
function ProfileRedirect() {
  const { user, metadata } = useCurrentUser();
  const profileUrl = useProfileUrl(user?.pubkey ?? '', metadata);
  if (!user) return <Navigate to="/" replace />;
  return <Navigate to={profileUrl} replace />;
}

export function AppRouter() {
  return (
    <AudioPlayerProvider>
    <BrowserRouter>
      <MinimizedAudioBar />
      <AudioNavigationGuard />
      <ScrollToTop />
      <Routes>
        {/* All routes share the persistent MainLayout (sidebar + nav) */}
        <Route element={<MainLayout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/feed" element={<Index />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/trends" element={<TrendsPage />} />
          <Route path="/profile" element={<ProfileRedirect />} />
          <Route path="/t/:tag" element={<HashtagPage />} />
          <Route path="/feed/:domain" element={<DomainFeedPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/settings/profile" element={<ProfileSettings />} />
          <Route path="/settings/feed" element={<ContentSettingsPage />} />
          <Route path="/settings/content" element={<ContentPage />} />
          <Route path="/settings/wallet" element={<WalletSettingsPage />} />
          <Route path="/settings/notifications" element={<NotificationSettings />} />
          <Route path="/settings/advanced" element={<AdvancedSettingsPage />} />
          <Route path="/settings/magic" element={<MagicSettingsPage />} />
          <Route path="/settings/network" element={<NetworkSettingsPage />} />
          <Route path="/events" element={<EventsFeedPage />} />
          <Route path="/photos" element={<PhotosFeedPage />} />
          <Route path="/videos" element={<VideosFeedPage />} />
          {/* /streams redirects to /videos for backward compatibility */}
          <Route path="/streams" element={<Navigate to="/videos" replace />} />
          <Route path="/vines" element={<VinesFeedPage />} />
          <Route path="/music" element={<MusicFeedPage />} />
          <Route path="/podcasts" element={<PodcastsFeedPage />} />
          <Route path="/polls" element={<KindFeedPage kind={pollsDef.kind} title={pollsDef.label} icon={sidebarItemIcon('polls', 'size-5')} />} />
          <Route path="/treasures" element={<TreasuresPage />} />
          <Route path="/colors" element={<KindFeedPage kind={colorsDef.kind} title={colorsDef.label} icon={sidebarItemIcon('colors', 'size-5')} />} />
          <Route path="/packs" element={<KindFeedPage kind={packsDef.kind} title={packsDef.label} icon={sidebarItemIcon('packs', 'size-5')} />} />
          <Route path="/webxdc" element={<WebxdcFeedPage />} />
          <Route path="/articles" element={<KindFeedPage kind={articlesDef.kind} title={articlesDef.label} icon={sidebarItemIcon('articles', 'size-5')} />} />
          <Route path="/decks" element={<KindFeedPage kind={decksDef.kind} title={decksDef.label} icon={sidebarItemIcon('decks', 'size-5')} />} />
          <Route path="/emojis" element={<KindFeedPage kind={emojisDef.kind} title={emojisDef.label} icon={sidebarItemIcon('emojis', 'size-5')} />} />
          <Route path="/themes" element={<ThemesPage />} />
          <Route path="/bookmarks" element={<BookmarksPage />} />
          <Route path="/ai-chat" element={<AIChatPage />} />
          <Route path="/world" element={<WorldPage />} />
          <Route path="/books" element={<BooksPage />} />
          <Route path="/i/*" element={<ExternalContentPage />} />

          {/* NIP-19 route for npub1, note1, naddr1, nevent1, nprofile1 */}
          <Route path="/:nip19" element={<NIP19Page />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
    </AudioPlayerProvider>
  );
}
export default AppRouter;
