import { lazy } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Clapperboard, BarChart3, Palette, PartyPopper } from "lucide-react";
import { ScrollToTop } from "./components/ScrollToTop";

// Eager: critical path (home page + 404)
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";

// Lazy: loaded on demand when the user navigates to these routes
const NIP19Page = lazy(() => import("./pages/NIP19Page").then(m => ({ default: m.NIP19Page })));
const ProfilePage = lazy(() => import("./pages/ProfilePage").then(m => ({ default: m.ProfilePage })));
const NotificationsPage = lazy(() => import("./pages/NotificationsPage").then(m => ({ default: m.NotificationsPage })));
const SearchPage = lazy(() => import("./pages/SearchPage").then(m => ({ default: m.SearchPage })));
const SettingsPage = lazy(() => import("./pages/SettingsPage").then(m => ({ default: m.SettingsPage })));
const HashtagPage = lazy(() => import("./pages/HashtagPage").then(m => ({ default: m.HashtagPage })));
const DomainFeedPage = lazy(() => import("./pages/DomainFeedPage").then(m => ({ default: m.DomainFeedPage })));
const BookmarksPage = lazy(() => import("./pages/BookmarksPage").then(m => ({ default: m.BookmarksPage })));
const KindFeedPage = lazy(() => import("./pages/KindFeedPage").then(m => ({ default: m.KindFeedPage })));
const StreamsFeedPage = lazy(() => import("./pages/StreamsFeedPage").then(m => ({ default: m.StreamsFeedPage })));
const TreasuresPage = lazy(() => import("./pages/TreasuresPage").then(m => ({ default: m.TreasuresPage })));

export function AppRouter() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<Index />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/t/:tag" element={<HashtagPage />} />
        <Route path="/timeline/:domain" element={<DomainFeedPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/settings/:section" element={<SettingsPage />} />
        <Route path="/vines" element={<KindFeedPage kind={34236} title="Vines" icon={<Clapperboard className="size-5" />} />} />
        <Route path="/polls" element={<KindFeedPage kind={1068} title="Polls" icon={<BarChart3 className="size-5" />} />} />
        <Route path="/treasures" element={<TreasuresPage />} />
        <Route path="/colors" element={<KindFeedPage kind={3367} title="Colors" icon={<Palette className="size-5" />} />} />
        <Route path="/packs" element={<KindFeedPage kind={39089} title="Follow Packs" icon={<PartyPopper className="size-5" />} />} />
        <Route path="/streams" element={<StreamsFeedPage />} />

        <Route path="/bookmarks" element={<BookmarksPage />} />

        {/* NIP-19 route for npub1, note1, naddr1, nevent1, nprofile1 */}
        <Route path="/:nip19" element={<NIP19Page />} />
        {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}
export default AppRouter;
