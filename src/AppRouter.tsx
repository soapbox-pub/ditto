import { useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AudioNavigationGuard } from "@/components/AudioNavigationGuard";
import { DeepLinkHandler } from "@/components/DeepLinkHandler";
import { MinimizedAudioBar } from "@/components/MinimizedAudioBar";
import { ReplyComposeModal } from "@/components/ReplyComposeModal";
import { AudioPlayerProvider } from "@/contexts/AudioPlayerContext";
import { sidebarItemIcon } from "@/lib/sidebarItems";
import { MainLayout } from "./components/MainLayout";
import { ScrollToTop } from "./components/ScrollToTop";
import { useCurrentUser } from "./hooks/useCurrentUser";
import { useProfileUrl } from "./hooks/useProfileUrl";
import { getExtraKindDef } from "./lib/extraKinds";
import { AdvancedSettingsPage } from "./pages/AdvancedSettingsPage";
import { AIChatPage } from "./pages/AIChatPage";
import { BlobbiPage } from "./pages/BlobbiPage";
import { BadgesFeedPage } from "./pages/BadgesFeedPage";
import { BookmarksPage } from "./pages/BookmarksPage";
import { BooksPage } from "./pages/BooksPage";
import { ContentPage } from "./pages/ContentPage";
import { ContentSettingsPage } from "./pages/ContentSettingsPage";
import { DomainFeedPage } from "./pages/DomainFeedPage";
import { EventsFeedPage } from "./pages/EventsFeedPage";
import { ExternalContentPage } from "./pages/ExternalContentPage";
import { GeotagPage } from "./pages/GeotagPage";
import { HashtagPage } from "./pages/HashtagPage";
import { HelpPage } from "./pages/HelpPage";
import { HomePage } from "./pages/HomePage";
import Index from "./pages/Index";
import { KindFeedPage } from "./pages/KindFeedPage";
import { MagicSettingsPage } from "./pages/MagicSettingsPage";
import Messages from "./pages/Messages";
import { MusicFeedPage } from "./pages/MusicFeedPage";
import { NetworkSettingsPage } from "./pages/NetworkSettingsPage";
import { NIP19Page } from "./pages/NIP19Page";
import NotFound from "./pages/NotFound";
import { NotificationSettings } from "./pages/NotificationSettings";
import { NotificationsPage } from "./pages/NotificationsPage";
import { PhotosFeedPage } from "./pages/PhotosFeedPage";
import { PodcastsFeedPage } from "./pages/PodcastsFeedPage";
import { PrivacyPolicyPage } from "./pages/PrivacyPolicyPage";
import { ProfileSettings } from "./pages/ProfileSettings";
import { RelayPage } from "./pages/RelayPage";
import { SearchPage } from "./pages/SearchPage";
import { SettingsPage } from "./pages/SettingsPage";
import { ThemesPage } from "./pages/ThemesPage";
import { TreasuresPage } from "./pages/TreasuresPage";
import { TrendsPage } from "./pages/TrendsPage";
import { UserListsPage } from "./pages/UserListsPage";
import { VideosFeedPage } from "./pages/VideosFeedPage";
import { VinesFeedPage } from "./pages/VinesFeedPage";
import { WalletSettingsPage } from "./pages/WalletSettingsPage";
import { WebxdcFeedPage } from "./pages/WebxdcFeedPage";
import { WorldPage } from "./pages/WorldPage";

const pollsDef = getExtraKindDef("polls")!;
const colorsDef = getExtraKindDef("colors")!;
const packsDef = getExtraKindDef("packs")!;
const articlesDef = getExtraKindDef("articles")!;
const decksDef = getExtraKindDef("decks")!;
const emojisDef = getExtraKindDef("emojis")!;
const developmentDef = getExtraKindDef("development")!;

/** Polls feed page with a FAB that opens the compose modal (poll mode via + menu). */
function PollsFeedPage() {
  const [composeOpen, setComposeOpen] = useState(false);
  return (
    <>
      <KindFeedPage
        kind={pollsDef.kind}
        title={pollsDef.label}
        icon={sidebarItemIcon("polls", "size-5")}
        onFabClick={() => setComposeOpen(true)}
      />
      <ReplyComposeModal open={composeOpen} onOpenChange={setComposeOpen} initialMode="poll" />
    </>
  );
}

/** Redirects /profile to the user's canonical profile URL (nip05 or npub). */
function ProfileRedirect() {
  const { user, metadata } = useCurrentUser();
  const profileUrl = useProfileUrl(user?.pubkey ?? "", metadata);
  if (!user) return <Navigate to="/" replace />;
  return <Navigate to={profileUrl} replace />;
}

export function AppRouter() {
  return (
    <AudioPlayerProvider>
      <BrowserRouter>
        <MinimizedAudioBar />
        <AudioNavigationGuard />
        <DeepLinkHandler />
        <ScrollToTop />
        <Routes>
          {/* All routes share the persistent MainLayout (sidebar + nav) */}
          <Route element={<MainLayout />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/feed" element={<Index />} />
            <Route path="/notifications" element={<NotificationsPage />} />
            <Route path="/messages" element={<Messages />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/trends" element={<TrendsPage />} />
            <Route path="/profile" element={<ProfileRedirect />} />
             <Route path="/t/:tag" element={<HashtagPage />} />
             <Route path="/g/:geohash" element={<GeotagPage />} />
            <Route path="/feed/:domain" element={<DomainFeedPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/settings/profile" element={<ProfileSettings />} />
            <Route path="/settings/feed" element={<ContentSettingsPage />} />
            <Route path="/settings/content" element={<ContentPage />} />
            <Route path="/settings/wallet" element={<WalletSettingsPage />} />
            <Route
              path="/settings/notifications"
              element={<NotificationSettings />}
            />
            <Route
              path="/settings/advanced"
              element={<AdvancedSettingsPage />}
            />
            <Route path="/settings/magic" element={<MagicSettingsPage />} />
            <Route path="/settings/network" element={<NetworkSettingsPage />} />
            <Route path="/lists" element={<UserListsPage />} />
            <Route path="/events" element={<EventsFeedPage />} />
            <Route path="/photos" element={<PhotosFeedPage />} />
            <Route path="/videos" element={<VideosFeedPage />} />
            {/* /streams redirects to /videos for backward compatibility */}
            <Route
              path="/streams"
              element={<Navigate to="/videos" replace />}
            />
            <Route path="/vines" element={<VinesFeedPage />} />
            <Route path="/music" element={<MusicFeedPage />} />
            <Route path="/podcasts" element={<PodcastsFeedPage />} />
            <Route path="/polls" element={<PollsFeedPage />} />
            <Route path="/treasures" element={<TreasuresPage />} />
            <Route
              path="/colors"
              element={
                <KindFeedPage
                  kind={colorsDef.kind}
                  title={colorsDef.label}
                  icon={sidebarItemIcon("colors", "size-5")}
                />
              }
            />
            <Route
              path="/packs"
              element={
                <KindFeedPage
                  kind={packsDef.kind}
                  title={packsDef.label}
                  icon={sidebarItemIcon("packs", "size-5")}
                />
              }
            />
            <Route path="/webxdc" element={<WebxdcFeedPage />} />
            <Route
              path="/articles"
              element={
                <KindFeedPage
                  kind={articlesDef.kind}
                  title={articlesDef.label}
                  icon={sidebarItemIcon("articles", "size-5")}
                />
              }
            />
            <Route
              path="/decks"
              element={
                <KindFeedPage
                  kind={decksDef.kind}
                  title={decksDef.label}
                  icon={sidebarItemIcon("decks", "size-5")}
                />
              }
            />
            <Route
              path="/emojis"
              element={
                <KindFeedPage
                  kind={emojisDef.kind}
                  title={emojisDef.label}
                  icon={sidebarItemIcon("emojis", "size-5")}
                />
              }
            />
            <Route
              path="/development"
              element={
                <KindFeedPage
                  kind={[
                    developmentDef.kind,
                    ...(developmentDef.extraFeedKinds ?? []),
                  ]}
                  title={developmentDef.label}
                  icon={sidebarItemIcon("development", "size-5")}
                  showFAB={false}
                />
              }
            />
            <Route path="/themes" element={<ThemesPage />} />
            <Route path="/bookmarks" element={<BookmarksPage />} />
            <Route path="/ai-chat" element={<AIChatPage />} />
            <Route path="/blobbi" element={<BlobbiPage />} />
            <Route path="/world" element={<WorldPage />} />
            <Route path="/badges" element={<BadgesFeedPage />} />
            <Route path="/books" element={<BooksPage />} />
            <Route path="/help" element={<HelpPage />} />
            <Route path="/privacy" element={<PrivacyPolicyPage />} />
            <Route path="/r/*" element={<RelayPage />} />
            <Route
              path="/settings/lists"
              element={<Navigate to="/lists" replace />}
            />
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
