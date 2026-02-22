import { useSeoMeta } from '@unhead/react';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { FeedTabs } from '@/components/FeedTabs';
import { InfiniteFeed } from '@/components/InfiniteFeed';
import { useFeed } from '@/hooks/useFeed';
import { useFeedTabs } from '@/hooks/useFeedTabs';
import { useCurrentUser } from '@/hooks/useCurrentUser';

interface KindFeedPageProps {
  kind: number | number[];
  title: string;
  icon?: React.ReactNode;
  emptyMessage?: string;
}

export function KindFeedPage({ kind, title, icon, emptyMessage }: KindFeedPageProps) {
  useSeoMeta({
    title: `${title} | Mew`,
    description: `${title} on Nostr`,
  });

  const { user } = useCurrentUser();
  const kinds = Array.isArray(kind) ? kind : [kind];

  const {
    activeTab,
    setActiveTab,
    showGlobalFeed,
    showCommunityFeed,
    communityLabel,
    queryKey,
  } = useFeedTabs();

  const feedQuery = useFeed(activeTab, { kinds });

  return (
    <main className="flex-1 min-w-0 sidebar:max-w-[600px] sidebar:border-l xl:border-r border-border min-h-screen">
      {/* Header */}
      <div className="flex items-center gap-4 px-4 mt-4 mb-5">
        <Link to="/" className="p-2 -ml-2 rounded-full hover:bg-secondary transition-colors sidebar:hidden">
          <ArrowLeft className="size-5" />
        </Link>
        <div className="flex items-center gap-2">
          {icon}
          <h1 className="text-xl font-bold">{title}</h1>
        </div>
      </div>

      {/* Tabs — only show when logged in (logged-out users see global feed) */}
      {user && (
        <FeedTabs
          activeTab={activeTab}
          onTabChange={setActiveTab}
          showGlobalFeed={showGlobalFeed}
          showCommunityFeed={showCommunityFeed}
          communityLabel={communityLabel}
        />
      )}

      {/* Feed */}
      <InfiniteFeed
        data={feedQuery.data}
        isPending={feedQuery.isPending}
        isLoading={feedQuery.isLoading}
        fetchNextPage={feedQuery.fetchNextPage}
        hasNextPage={feedQuery.hasNextPage}
        isFetchingNextPage={feedQuery.isFetchingNextPage}
        queryKey={queryKey}
        emptyMessage={emptyMessage ?? `No ${title.toLowerCase()} yet. Check back soon!`}
      />
    </main>
  );
}
