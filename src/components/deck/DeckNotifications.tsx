import { useMemo, useEffect } from 'react';
import { useNotifications, type NotificationItem } from '@/hooks/useNotifications';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useMuteList } from '@/hooks/useMuteList';
import { isEventMuted } from '@/lib/muteHelpers';
import { NoteCard } from '@/components/NoteCard';
import { Skeleton } from '@/components/ui/skeleton';

/** Compact notification list for a deck column. */
export function DeckNotifications() {
  const { user } = useCurrentUser();
  const { items, isLoading, hasFetched, markAsRead, newNotificationIds } = useNotifications();
  const { muteItems } = useMuteList();

  // Mark as read when mounted
  useEffect(() => {
    if (!user || newNotificationIds.size === 0) return;
    const timer = setTimeout(() => markAsRead(), 1000);
    return () => clearTimeout(timer);
  }, [user, newNotificationIds.size, markAsRead]);

  const filtered = useMemo(() => {
    if (muteItems.length === 0) return items;
    return items.filter((item) => !isEventMuted(item.event, muteItems));
  }, [items, muteItems]);

  if (!user) {
    return <div className="py-12 text-center text-muted-foreground text-sm">Log in to see notifications.</div>;
  }

  if (isLoading || !hasFetched) {
    return (
      <div className="divide-y divide-border">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="px-4 py-3">
            <div className="flex items-center gap-2 mb-2">
              <Skeleton className="size-4 rounded-full" />
              <Skeleton className="h-4 w-32" />
            </div>
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5 mt-1" />
          </div>
        ))}
      </div>
    );
  }

  if (filtered.length === 0) {
    return <div className="py-12 text-center text-muted-foreground text-sm">No notifications yet.</div>;
  }

  return (
    <div>
      {filtered.map((item) => (
        <DeckNotificationItem key={item.event.id} item={item} />
      ))}
    </div>
  );
}

/** Renders a single notification in the deck as a compact NoteCard. */
function DeckNotificationItem({ item }: { item: NotificationItem }) {
  const event = item.referencedEvent ?? item.event;
  return <NoteCard event={event} className="border-b border-border" />;
}
