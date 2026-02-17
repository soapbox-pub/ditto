import { BrowserRouter, Route, Routes } from "react-router-dom";
import { ScrollToTop } from "./components/ScrollToTop";

import Index from "./pages/Index";
import { NIP19Page } from "./pages/NIP19Page";
import { ProfilePage } from "./pages/ProfilePage";
import { NotificationsPage } from "./pages/NotificationsPage";
import { SearchPage } from "./pages/SearchPage";
import { SettingsPage } from "./pages/SettingsPage";
import { HashtagPage } from "./pages/HashtagPage";
import { BookmarksPage } from "./pages/BookmarksPage";
import { PlaceholderPage } from "./pages/PlaceholderPage";
import { WalletPage } from "./pages/WalletPage";
import { KindFeedPage } from "./pages/KindFeedPage";
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
        <Route path="/vines" element={<KindFeedPage kind={34236} title="Vines" />} />
        <Route path="/polls" element={<KindFeedPage kind={1068} title="Polls" />} />
        <Route path="/treasures" element={<KindFeedPage kind={37516} title="Treasures" />} />
        <Route path="/colors" element={<KindFeedPage kind={3367} title="Colors" />} />
        <Route path="/wallet" element={<WalletPage />} />
        <Route path="/bookmarks" element={<BookmarksPage />} />
        <Route path="/mutes" element={<PlaceholderPage title="Mutes" />} />

        {/* NIP-19 route for npub1, note1, naddr1, nevent1, nprofile1 */}
        <Route path="/:nip19" element={<NIP19Page />} />
        {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}
export default AppRouter;
