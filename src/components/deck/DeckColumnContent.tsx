import { Suspense, lazy } from 'react';
import { Feed } from '@/components/Feed';
import { DeckNotifications } from '@/components/deck/DeckNotifications';
import { DeckSearch } from '@/components/deck/DeckSearch';
import { DeckTrends } from '@/components/deck/DeckTrends';
import { DeckBookmarks } from '@/components/deck/DeckBookmarks';
import { DeckProfile } from '@/components/deck/DeckProfile';
import { DeckKindFeed } from '@/components/deck/DeckKindFeed';
import { Skeleton } from '@/components/ui/skeleton';

const AIChatPage = lazy(() => import('@/pages/AIChatPage').then((m) => ({ default: m.AIChatPage })));

interface DeckColumnContentProps {
  type: string;
}

export function DeckColumnContent({ type }: DeckColumnContentProps) {
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
    default:
      return <DeckKindFeed type={type} />;
  }
}
