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
import { VinesPage } from "./pages/VinesPage";
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
        <Route path="/vines" element={<VinesPage />} />
        <Route path="/polls" element={<PlaceholderPage title="Polls" />} />
        <Route path="/treasures" element={<PlaceholderPage title="Treasures" />} />
        <Route path="/colors" element={<PlaceholderPage title="Colors" />} />
        <Route path="/wallet" element={<PlaceholderPage title="Wallet" />} />
        <Route path="/bookmarks" element={<BookmarksPage />} />
        <Route path="/mutes" element={<PlaceholderPage title="Mutes" />} />
        <Route path="/domain-blocks" element={<PlaceholderPage title="Domain blocks" />} />
        {/* NIP-19 route for npub1, note1, naddr1, nevent1, nprofile1 */}
        <Route path="/:nip19" element={<NIP19Page />} />
        {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}
export default AppRouter;
