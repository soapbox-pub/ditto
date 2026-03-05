import { useAppContext } from '@/hooks/useAppContext';

import Index from './Index';
import { NotificationsPage } from './NotificationsPage';
import { SearchPage } from './SearchPage';
import { TrendsPage } from './TrendsPage';
import { BookmarksPage } from './BookmarksPage';
import { SettingsPage } from './SettingsPage';
import { AIChatPage } from './AIChatPage';
import { EventsFeedPage } from './EventsFeedPage';
import { PhotosFeedPage } from './PhotosFeedPage';
import { VideosFeedPage } from './VideosFeedPage';
import { VinesFeedPage } from './VinesFeedPage';
import { MusicFeedPage } from './MusicFeedPage';
import { PodcastsFeedPage } from './PodcastsFeedPage';
import { WebxdcFeedPage } from './WebxdcFeedPage';
import { ThemesPage } from './ThemesPage';
import { TreasuresPage } from './TreasuresPage';
import { WorldPage } from './WorldPage';
import { BooksPage } from './BooksPage';
import { KindFeedPage } from './KindFeedPage';
import { getExtraKindDef } from '@/lib/extraKinds';
import { sidebarItemIcon } from '@/lib/sidebarItems';

/** Map of sidebar item IDs to page components. */
const PAGE_COMPONENTS: Record<string, React.ComponentType> = {
  'feed': Index,
  'notifications': NotificationsPage,
  'search': SearchPage,
  'trends': TrendsPage,
  'bookmarks': BookmarksPage,
  'settings': SettingsPage,
  'ai-chat': AIChatPage,
  'events': EventsFeedPage,
  'photos': PhotosFeedPage,
  'videos': VideosFeedPage,
  'vines': VinesFeedPage,
  'music': MusicFeedPage,
  'podcasts': PodcastsFeedPage,
  'webxdc': WebxdcFeedPage,
  'themes': ThemesPage,
  'treasures': TreasuresPage,
  'world': WorldPage,
  'books': BooksPage,
};

/** Sidebar items that use KindFeedPage and need extra kind definitions. */
const KIND_FEED_ITEMS = ['polls', 'colors', 'packs', 'articles', 'decks', 'emojis'] as const;

function KindFeedWrapper({ itemId }: { itemId: string }) {
  const def = getExtraKindDef(itemId);
  if (!def) return <Index />;
  return <KindFeedPage kind={def.kind} title={def.label} icon={sidebarItemIcon(itemId, 'size-5')} />;
}

/**
 * Renders the page component configured as the homepage.
 * Falls back to the Feed if the configured homePage is invalid.
 */
export function HomePage() {
  const { config } = useAppContext();
  const homePage = config.homePage;

  // Check if it's a kind feed item
  if ((KIND_FEED_ITEMS as readonly string[]).includes(homePage)) {
    return <KindFeedWrapper itemId={homePage} />;
  }

  // Check the direct component map
  const PageComponent = PAGE_COMPONENTS[homePage];
  if (PageComponent) {
    return <PageComponent />;
  }

  // Fallback: if the configured homepage is unknown, render Feed
  return <Index />;
}
