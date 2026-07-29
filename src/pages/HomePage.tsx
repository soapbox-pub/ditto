import { lazy } from 'react';
import { Navigate } from 'react-router-dom';
import { useAppContext } from '@/hooks/useAppContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useProfileUrl } from '@/hooks/useProfileUrl';
import { getExtraKindDef, getSectionKinds } from '@/lib/extraKinds';
import { sidebarItemIcon } from '@/lib/sidebarItems';

import Index from './Index';

// All other pages are lazy-loaded so they don't bloat the index chunk.
// HomePage renders exactly ONE page at a time, so only that page's chunk is loaded.
//
// Every sidebar item that can be chosen as the homepage (see SIDEBAR_ITEMS) must
// resolve here — either in PAGE_LOADERS, in KIND_FEED_ITEMS, or via one of the
// special-case branches in HomePage(). Anything missing silently falls back to
// the Feed, which looks like the homepage setting "doesn't work".
const PAGE_LOADERS: Record<string, React.LazyExoticComponent<React.ComponentType>> = {
  'notifications': lazy(() => import('./NotificationsPage').then(m => ({ default: m.NotificationsPage }))),
  'search': lazy(() => import('./SearchPage').then(m => ({ default: m.SearchPage }))),
  'trends': lazy(() => import('./TrendsPage').then(m => ({ default: m.TrendsPage }))),
  'bookmarks': lazy(() => import('./BookmarksPage').then(m => ({ default: m.BookmarksPage }))),
  'settings': lazy(() => import('./SettingsPage').then(m => ({ default: m.SettingsPage }))),
  'ai-chat': lazy(() => import('./AIChatPage').then(m => ({ default: m.AIChatPage }))),
  'events': lazy(() => import('./EventsFeedPage').then(m => ({ default: m.EventsFeedPage }))),
  'photos': lazy(() => import('./PhotosFeedPage').then(m => ({ default: m.PhotosFeedPage }))),
  'videos': lazy(() => import('./VideosFeedPage').then(m => ({ default: m.VideosFeedPage }))),
  'vines': lazy(() => import('./VinesFeedPage').then(m => ({ default: m.VinesFeedPage }))),
  'music': lazy(() => import('./MusicFeedPage').then(m => ({ default: m.MusicFeedPage }))),
  'podcasts': lazy(() => import('./PodcastsFeedPage').then(m => ({ default: m.PodcastsFeedPage }))),
  'webxdc': lazy(() => import('./WebxdcFeedPage').then(m => ({ default: m.WebxdcFeedPage }))),
  'themes': lazy(() => import('./ThemesPage').then(m => ({ default: m.ThemesPage }))),
  'treasures': lazy(() => import('./TreasuresPage').then(m => ({ default: m.TreasuresPage }))),
  'world': lazy(() => import('./WorldPage').then(m => ({ default: m.WorldPage }))),
  'books': lazy(() => import('./BooksPage').then(m => ({ default: m.BooksPage }))),
  'badges': lazy(() => import('./BadgesPage').then(m => ({ default: m.BadgesPage }))),
  'lists': lazy(() => import('./UserListsPage').then(m => ({ default: m.UserListsPage }))),
  'wallet': lazy(() => import('./WalletPage').then(m => ({ default: m.WalletPage }))),
  'changelog': lazy(() => import('./ChangelogPage').then(m => ({ default: m.ChangelogPage }))),
  'letters': lazy(() => import('./LettersPage').then(m => ({ default: m.LettersPage }))),
  'blobbi': lazy(() => import('./BlobbiPage').then(m => ({ default: m.BlobbiPage }))),
  'help': lazy(() => import('./HelpPage').then(m => ({ default: m.HelpPage }))),
  'quizzes': lazy(() => import('./QuizzesPage').then(m => ({ default: m.QuizzesPage }))),
  'cards': lazy(() => import('./MemoryCardsPage').then(m => ({ default: m.MemoryCardsPage }))),
  'archive': lazy(() => import('./ArchivePage').then(m => ({ default: m.ArchivePage }))),
  'wikipedia': lazy(() => import('./WikipediaPage').then(m => ({ default: m.WikipediaPage }))),
  'bluesky': lazy(() => import('./BlueskyPage').then(m => ({ default: m.BlueskyPage }))),
};

/** Sidebar items that use KindFeedPage and need extra kind definitions. */
const KIND_FEED_ITEMS = ['polls', 'colors', 'packs', 'articles', 'decks', 'emojis', 'highlights'] as const;

// KindFeedPage is lazy too
const LazyKindFeedPage = lazy(() => import('./KindFeedPage').then(m => ({ default: m.KindFeedPage })));

function KindFeedWrapper({ itemId }: { itemId: string }) {
  const def = getExtraKindDef(itemId);
  if (!def) return <Index />;
  return <LazyKindFeedPage kind={def.kind} title={def.label} icon={sidebarItemIcon(itemId, 'size-5')} />;
}

/**
 * Redirects the homepage to the logged-in user's profile.
 *
 * Falls back to the Feed when logged out — the /profile route would redirect
 * back to "/", so redirecting again here would create an infinite loop.
 */
function ProfileHomeRedirect() {
  const { user, metadata } = useCurrentUser();
  const profileUrl = useProfileUrl(user?.pubkey ?? '', metadata);
  if (!user) return <Index />;
  return <Navigate to={profileUrl} replace />;
}

/**
 * Renders the page component configured as the homepage.
 * Falls back to the Feed if the configured homePage is invalid.
 *
 * This component is rendered inside MainLayout's Suspense boundary,
 * so lazy components will show the page skeleton while loading.
 */
export function HomePage() {
  const { config } = useAppContext();
  const homePage = config.homePage;

  // Profile redirects to the user's canonical profile URL.
  if (homePage === 'profile') {
    return <ProfileHomeRedirect />;
  }

  // Development shows the whole "Development" section (git, custom NIPs, nsites,
  // apps), matching the /development route rather than a single kind.
  if (homePage === 'development') {
    return (
      <LazyKindFeedPage
        kind={getSectionKinds('development')}
        title="Development"
        icon={sidebarItemIcon('development', 'size-5')}
        showFAB={false}
      />
    );
  }

  // Check if it's a kind feed item
  if ((KIND_FEED_ITEMS as readonly string[]).includes(homePage)) {
    return <KindFeedWrapper itemId={homePage} />;
  }

  // Check the lazy component map
  const PageComponent = PAGE_LOADERS[homePage];
  if (PageComponent) {
    return <PageComponent />;
  }

  // Default fallback: Feed (eagerly loaded)
  return <Index />;
}
