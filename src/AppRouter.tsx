import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { getExtraKindDef } from "./lib/extraKinds";
import { sidebarItemIcon } from "./components/SidebarNavItem";
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
import { MagicSettingsPage } from "./pages/MagicSettingsPage";
import { NetworkSettingsPage } from "./pages/NetworkSettingsPage";
import { HashtagPage } from "./pages/HashtagPage";
import { DomainFeedPage } from "./pages/DomainFeedPage";
import { BookmarksPage } from "./pages/BookmarksPage";
import { KindFeedPage } from "./pages/KindFeedPage";
import { StreamsFeedPage } from "./pages/StreamsFeedPage";
import { VinesFeedPage } from "./pages/VinesFeedPage";
import { WebxdcFeedPage } from "./pages/WebxdcFeedPage";
import { TreasuresPage } from "./pages/TreasuresPage";
import { ThemesPage } from "./pages/ThemesPage";
import { ThemeBuilderPage } from "./pages/ThemeBuilderPage";
import { ExternalContentPage } from "./pages/ExternalContentPage";

const vinesDef = getExtraKindDef('vines')!;
const pollsDef = getExtraKindDef('polls')!;
const colorsDef = getExtraKindDef('colors')!;
const packsDef = getExtraKindDef('packs')!;
const articlesDef = getExtraKindDef('articles')!;
const decksDef = getExtraKindDef('decks')!;

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
          <Route path="/feed/:domain" element={<DomainFeedPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/settings/profile" element={<ProfileSettings />} />
          <Route path="/settings/theme" element={<ThemeSettingsPage />} />
          <Route path="/settings/content" element={<ContentSettingsPage />} />
          <Route path="/settings/theme/edit" element={<ThemeBuilderPage />} />
          <Route path="/settings/wallet" element={<WalletSettingsPage />} />
          <Route path="/settings/notifications" element={<NotificationSettings />} />
          <Route path="/settings/advanced" element={<AdvancedSettingsPage />} />
          <Route path="/settings/magic" element={<MagicSettingsPage />} />
          <Route path="/settings/network" element={<NetworkSettingsPage />} />
          <Route path="/vines" element={<VinesFeedPage />} />
          <Route path="/polls" element={<KindFeedPage kind={pollsDef.kind} title={pollsDef.label} icon={sidebarItemIcon('polls', 'size-5')} />} />
          <Route path="/treasures" element={<TreasuresPage />} />
          <Route path="/colors" element={<KindFeedPage kind={colorsDef.kind} title={colorsDef.label} icon={sidebarItemIcon('colors', 'size-5')} />} />
          <Route path="/packs" element={<KindFeedPage kind={packsDef.kind} title={packsDef.label} icon={sidebarItemIcon('packs', 'size-5')} />} />
          <Route path="/streams" element={<StreamsFeedPage />} />
          <Route path="/webxdc" element={<WebxdcFeedPage />} />
          <Route path="/articles" element={<KindFeedPage kind={articlesDef.kind} title={articlesDef.label} icon={sidebarItemIcon('articles', 'size-5')} />} />
          <Route path="/decks" element={<KindFeedPage kind={decksDef.kind} title={decksDef.label} icon={sidebarItemIcon('decks', 'size-5')} />} />
          <Route path="/themes" element={<ThemesPage />} />
          <Route path="/bookmarks" element={<BookmarksPage />} />
          <Route path="/i/*" element={<ExternalContentPage />} />

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
