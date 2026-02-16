import { useSeoMeta } from '@unhead/react';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { MainLayout } from '@/components/MainLayout';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAuthor } from '@/hooks/useAuthor';
import { genUserName } from '@/lib/genUserName';
import { timeAgo } from '@/lib/timeAgo';
import { nip19 } from 'nostr-tools';
import type { NostrEvent } from '@nostrify/nostrify';
import { useMemo } from 'react';

export function NotificationsPage() {
  useSeoMeta({
    title: 'Notifications | Mew',
    description: 'Your Nostr notifications',
  });

  const { user } = useCurrentUser();
  const { nostr } = useNostr();

  const { data: notifications, isLoading } = useQuery<NostrEvent[]>({
    queryKey: ['notifications', user?.pubkey ?? ''],
    queryFn: async ({ signal }) => {
      if (!user) return [];
      const events = await nostr.query(
        [{ kinds: [1, 6, 7, 9735], '#p': [user.pubkey], limit: 50 }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]) },
      );
      // Filter out own events
      return events
        .filter((e) => e.pubkey !== user.pubkey)
        .sort((a, b) => b.created_at - a.created_at);
    },
    enabled: !!user,
  });

  return (
    <MainLayout hideMobileTopBar>
      <main className="flex-1 min-w-0 sidebar:max-w-[600px] sidebar:border-x border-border min-h-screen">
        <div className="flex items-center gap-4 px-4 py-3 sticky top-0 bg-background/80 backdrop-blur-md z-10 border-b border-border">
          <Link to="/" className="p-2 rounded-full hover:bg-secondary transition-colors">
            <ArrowLeft className="size-5" />
          </Link>
          <h1 className="text-xl font-bold">Notifications</h1>
        </div>

        {!user ? (
          <div className="py-16 text-center text-muted-foreground">
            Log in to see your notifications.
          </div>
        ) : isLoading ? (
          <div className="divide-y divide-border">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3">
                <Skeleton className="size-10 rounded-full" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3 w-32" />
                </div>
              </div>
            ))}
          </div>
        ) : notifications && notifications.length > 0 ? (
          <div className="divide-y divide-border">
            {notifications.map((event) => (
              <NotificationItem key={event.id} event={event} />
            ))}
          </div>
        ) : (
          <div className="py-16 text-center text-muted-foreground">
            No notifications yet.
          </div>
        )}
      </main>
    </MainLayout>
  );
}

function NotificationItem({ event }: { event: NostrEvent }) {
  const author = useAuthor(event.pubkey);
  const metadata = author.data?.metadata;
  const displayName = metadata?.name || genUserName(event.pubkey);
  const npub = useMemo(() => nip19.npubEncode(event.pubkey), [event.pubkey]);

  const typeLabel = (() => {
    switch (event.kind) {
      case 1: return 'replied to you';
      case 6: return 'reposted your note';
      case 7: return 'liked your note';
      case 9735: return 'zapped you';
      default: return 'interacted';
    }
  })();

  return (
    <div className="flex items-start gap-3 px-4 py-3 hover:bg-secondary/30 transition-colors">
      <Link to={`/${npub}`}>
        <Avatar className="size-10">
          <AvatarImage src={metadata?.picture} alt={displayName} />
          <AvatarFallback className="bg-primary/20 text-primary text-sm">
            {displayName[0].toUpperCase()}
          </AvatarFallback>
        </Avatar>
      </Link>
      <div className="flex-1 min-w-0">
        <p className="text-sm">
          <Link to={`/${npub}`} className="font-bold hover:underline">{displayName}</Link>
          {' '}
          <span className="text-muted-foreground">{typeLabel}</span>
        </p>
        {event.kind === 1 && event.content && (
          <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">{event.content}</p>
        )}
        <span className="text-xs text-muted-foreground">{timeAgo(event.created_at)}</span>
      </div>
    </div>
  );
}
