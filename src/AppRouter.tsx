import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Clapperboard, BarChart3, Palette, PartyPopper } from "lucide-react";
import { ScrollToTop } from "./components/ScrollToTop";

import Index from "./pages/Index";
import { NIP19Page } from "./pages/NIP19Page";
import { ProfilePage } from "./pages/ProfilePage";
import { NotificationsPage } from "./pages/NotificationsPage";
import { SearchPage } from "./pages/SearchPage";
import { SettingsPage } from "./pages/SettingsPage";
import { HashtagPage } from "./pages/HashtagPage";
import { BookmarksPage } from "./pages/BookmarksPage";

import { KindFeedPage } from "./pages/KindFeedPage";
import { TreasuresPage } from "./pages/TreasuresPage";
import NotFound from "./pages/NotFound";

export function AppRouter() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<Index />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/u/:npub" element={<ProfilePage />} />
        <Route path="/t/:tag" element={<HashtagPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/settings/:section" element={<SettingsPage />} />
        <Route path="/vines" element={<KindFeedPage kind={34236} title="Vines" icon={<Clapperboard className="size-5" />} />} />
        <Route path="/polls" element={<KindFeedPage kind={1068} title="Polls" icon={<BarChart3 className="size-5" />} />} />
        <Route path="/treasures" element={<TreasuresPage />} />
        <Route path="/colors" element={<KindFeedPage kind={3367} title="Colors" icon={<Palette className="size-5" />} />} />
        <Route path="/packs" element={<KindFeedPage kind={39089} title="Follow Packs" icon={<PartyPopper className="size-5" />} />} />

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
