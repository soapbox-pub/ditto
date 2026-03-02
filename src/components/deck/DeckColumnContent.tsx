import { Suspense, lazy } from 'react';
import { Feed } from '@/components/Feed';
import { DeckNotifications } from '@/components/deck/DeckNotifications';
import { DeckSearch } from '@/components/deck/DeckSearch';
import { DeckTrends } from '@/components/deck/DeckTrends';
import { DeckBookmarks } from '@/components/deck/DeckBookmarks';
import { DeckProfile } from '@/components/deck/DeckProfile';
import { DeckKindFeed } from '@/components/deck/DeckKindFeed';
import { DeckHashtagFeed } from '@/components/deck/DeckHashtagFeed';
import { DeckExternalContent } from '@/components/deck/DeckExternalContent';
import { DeckDomainFeed } from '@/components/deck/DeckDomainFeed';
import { DeckSettings } from '@/components/deck/DeckSettings';
import { Skeleton } from '@/components/ui/skeleton';

const AIChatPage = lazy(() => import('@/pages/AIChatPage').then((m) => ({ default: m.AIChatPage })));
const ThemeSettingsPage = lazy(() => import('@/pages/ThemeSettingsPage').then((m) => ({ default: m.ThemeSettingsPage })));
const BooksPage = lazy(() => import('@/pages/BooksPage').then((m) => ({ default: m.BooksPage })));
const WorldPage = lazy(() => import('@/pages/WorldPage').then((m) => ({ default: m.WorldPage })));

interface DeckColumnContentProps {
  type: string;
  params?: Record<string, string>;
}

export function DeckColumnContent({ type, params }: DeckColumnContentProps) {
  switch (type) {
    case 'feed':
      return <Feed hideCompose />;
    case 'notifications':
      return <DeckNotifications />;
    case 'search':
      return <DeckSearch />;
    case 'trends':
      return <DeckTrends />;
    case 'bookmarks':
      return <DeckBookmarks />;
    case 'profile':
      return <DeckProfile />;
    case 'ai-chat':
      return (
        <Suspense fallback={<div className="p-4"><Skeleton className="h-32 w-full" /></div>}>
          <AIChatPage />
        </Suspense>
      );
    case 'settings':
      return <DeckSettings initialSection={params?.section} />;
    case 'theme':
      return (
        <Suspense fallback={<div className="p-4"><Skeleton className="h-32 w-full" /></div>}>
          <ThemeSettingsPage />
        </Suspense>
      );
    case 'hashtag':
      return params?.tag ? <DeckHashtagFeed tag={params.tag} /> : <div className="py-16 text-center text-muted-foreground">No hashtag specified.</div>;
    case 'discuss':
      return params?.uri ? <DeckExternalContent uri={params.uri} /> : <div className="py-16 text-center text-muted-foreground">No content URI specified.</div>;
    case 'domain-feed':
      return params?.domain ? <DeckDomainFeed domain={params.domain} /> : <div className="py-16 text-center text-muted-foreground">No domain specified.</div>;
    case 'books':
      return (
        <Suspense fallback={<div className="p-4"><Skeleton className="h-32 w-full" /></div>}>
          <BooksPage />
        </Suspense>
      );
    case 'world':
      return (
        <Suspense fallback={<div className="p-4"><Skeleton className="h-32 w-full" /></div>}>
          <WorldPage />
        </Suspense>
      );
    default:
      return <DeckKindFeed type={type} />;
  }
}
