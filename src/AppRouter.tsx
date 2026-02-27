import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Clapperboard, BarChart3, Palette, PartyPopper, FileText, Sparkles } from "lucide-react";
import { CardsIcon } from "./components/icons/CardsIcon";
import { ScrollToTop } from "./components/ScrollToTop";
import { MainLayout } from "./components/MainLayout";
import { useCurrentUser } from "./hooks/useCurrentUser";
import { useProfileUrl } from "./hooks/useProfileUrl";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import { NIP19Page } from "./pages/NIP19Page";
import { NotificationsPage } from "./pages/NotificationsPage";
import { SearchPage } from "./pages/SearchPage";
import { TrendsPage } from "./pages/TrendsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { ProfileSettings } from "./pages/ProfileSettings";
import { ThemeSettingsPage } from "./pages/ThemeSettingsPage";
import { ContentSettingsPage } from "./pages/ContentSettingsPage";
import { WalletSettingsPage } from "./pages/WalletSettingsPage";
import { NotificationSettings } from "./pages/NotificationSettings";
import { AdvancedSettingsPage } from "./pages/AdvancedSettingsPage";
import { HashtagPage } from "./pages/HashtagPage";
import { DomainFeedPage } from "./pages/DomainFeedPage";
import { BookmarksPage } from "./pages/BookmarksPage";
import { KindFeedPage } from "./pages/KindFeedPage";
import { StreamsFeedPage } from "./pages/StreamsFeedPage";
import { WebxdcFeedPage } from "./pages/WebxdcFeedPage";
import { TreasuresPage } from "./pages/TreasuresPage";
import { ThemeBuilderPage } from "./pages/ThemeBuilderPage";

/** Redirects /profile to the user's canonical profile URL (nip05 or npub). */
function ProfileRedirect() {
  const { user, metadata } = useCurrentUser();
  const profileUrl = useProfileUrl(user?.pubkey ?? '', metadata);
  if (!user) return <Navigate to="/" replace />;
  return <Navigate to={profileUrl} replace />;
}

export function AppRouter() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <Routes>
        {/* All routes share the persistent MainLayout (sidebar + nav) */}
        <Route element={<MainLayout />}>
          <Route path="/" element={<Index />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/trends" element={<TrendsPage />} />
          <Route path="/profile" element={<ProfileRedirect />} />
          <Route path="/t/:tag" element={<HashtagPage />} />
          <Route path="/timeline/:domain" element={<DomainFeedPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/settings/profile" element={<ProfileSettings />} />
          <Route path="/settings/theme" element={<ThemeSettingsPage />} />
          <Route path="/settings/content" element={<ContentSettingsPage />} />
          <Route path="/settings/theme/edit" element={<ThemeBuilderPage />} />
          <Route path="/settings/wallet" element={<WalletSettingsPage />} />
          <Route path="/settings/notifications" element={<NotificationSettings />} />
          <Route path="/settings/advanced" element={<AdvancedSettingsPage />} />
          <Route path="/vines" element={<KindFeedPage kind={34236} title="Vines" icon={<Clapperboard className="size-5" />} />} />
          <Route path="/polls" element={<KindFeedPage kind={1068} title="Polls" icon={<BarChart3 className="size-5" />} />} />
          <Route path="/treasures" element={<TreasuresPage />} />
          <Route path="/colors" element={<KindFeedPage kind={3367} title="Colors" icon={<Palette className="size-5" />} />} />
          <Route path="/packs" element={<KindFeedPage kind={39089} title="Follow Packs" icon={<PartyPopper className="size-5" />} />} />
          <Route path="/streams" element={<StreamsFeedPage />} />
          <Route path="/webxdc" element={<WebxdcFeedPage />} />
          <Route path="/articles" element={<KindFeedPage kind={30023} title="Articles" icon={<FileText className="size-5" />} />} />
          <Route path="/decks" element={<KindFeedPage kind={37381} title="Magic Decks" icon={<CardsIcon className="size-5" />} />} />
          <Route path="/themes" element={<KindFeedPage kind={36767} title="Public Themes" icon={<Sparkles className="size-5" />} emptyMessage="No public themes yet. Be the first to share yours!" backTo="/settings/theme" alwaysShowBack fabHref="/settings/theme/edit?new" />} />
          <Route path="/bookmarks" element={<BookmarksPage />} />

          {/* NIP-19 route for npub1, note1, naddr1, nevent1, nprofile1 */}
          <Route path="/:nip19" element={<NIP19Page />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
export default AppRouter;
