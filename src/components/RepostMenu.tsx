import { Quote, Undo2 } from 'lucide-react';
import { RepostIcon } from '@/components/icons/RepostIcon';
import { useState } from 'react';
import type { NostrEvent } from '@nostrify/nostrify';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ReplyComposeModal } from '@/components/ReplyComposeModal';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useDeleteEvent } from '@/hooks/useDeleteEvent';
import { useRepostStatus } from '@/hooks/useRepostStatus';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/useToast';
import type { EventStats } from '@/hooks/useTrending';

interface RepostMenuProps {
  event: NostrEvent;
  children: React.ReactNode | ((isReposted: boolean) => React.ReactNode);
}

export function RepostMenu({ event, children }: RepostMenuProps) {
  const [open, setOpen] = useState(false);
  const [quoteOpen, setQuoteOpen] = useState(false);
  const { user } = useCurrentUser();
  const { mutate: publishEvent } = useNostrPublish();
  const { mutate: deleteEvent } = useDeleteEvent();
  const { data: repostEventId } = useRepostStatus(event.id);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const isReposted = !!repostEventId;

  const handleRepost = () => {
    if (!user) {
      toast({ title: 'Please log in to repost', variant: 'destructive' });
      return;
    }

    // Optimistically update stats cache immediately
    const prevStats = queryClient.getQueryData<EventStats>(['event-stats', event.id]);
    if (prevStats) {
      queryClient.setQueryData<EventStats>(['event-stats', event.id], {
        ...prevStats,
        reposts: prevStats.reposts + 1,
      });
    }

    // Optimistically mark as reposted
    queryClient.setQueryData(['user-repost', event.id], 'optimistic');

    // Kind 6 repost
    publishEvent(
      {
        kind: 6,
        content: JSON.stringify(event),
        created_at: Math.floor(Date.now() / 1000),
        tags: [
          ['e', event.id],
          ['p', event.pubkey],
        ],
      },
      {
        onSuccess: () => {
          toast({ title: 'Reposted!' });
          setOpen(false);
          // Delay invalidation so the relay has time to index the new event.
          setTimeout(() => {
            queryClient.invalidateQueries({ queryKey: ['event-stats', event.id] });
            queryClient.invalidateQueries({ queryKey: ['event-interactions', event.id] });
            queryClient.invalidateQueries({ queryKey: ['user-repost', event.id] });
          }, 3000);
        },
        onError: () => {
          toast({ title: 'Failed to repost', variant: 'destructive' });
          // Revert optimistic updates
          if (prevStats) {
            queryClient.setQueryData<EventStats>(['event-stats', event.id], prevStats);
          }
          queryClient.setQueryData(['user-repost', event.id], null);
        },
      }
    );
  };

  const handleUnrepost = () => {
    if (!user || !repostEventId) return;

    // Optimistically update stats cache
    const prevStats = queryClient.getQueryData<EventStats>(['event-stats', event.id]);
    if (prevStats) {
      queryClient.setQueryData<EventStats>(['event-stats', event.id], {
        ...prevStats,
        reposts: Math.max(0, prevStats.reposts - 1),
      });
    }

    // Optimistically mark as not reposted
    const prevRepostStatus = queryClient.getQueryData(['user-repost', event.id]);
    queryClient.setQueryData(['user-repost', event.id], null);

    deleteEvent(
      { eventId: repostEventId, eventKind: 6 },
      {
        onSuccess: () => {
          toast({ title: 'Repost removed' });
          setOpen(false);
          setTimeout(() => {
            queryClient.invalidateQueries({ queryKey: ['event-stats', event.id] });
            queryClient.invalidateQueries({ queryKey: ['event-interactions', event.id] });
            queryClient.invalidateQueries({ queryKey: ['user-repost', event.id] });
          }, 3000);
        },
        onError: () => {
          toast({ title: 'Failed to remove repost', variant: 'destructive' });
          // Revert optimistic updates
          if (prevStats) {
            queryClient.setQueryData<EventStats>(['event-stats', event.id], prevStats);
          }
          queryClient.setQueryData(['user-repost', event.id], prevRepostStatus);
        },
      }
    );
  };

  const handleQuote = () => {
    setOpen(false);
    setQuoteOpen(true);
  };

  const menuContent = (
    <div className="w-full">
      {isReposted ? (
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleUnrepost();
          }}
          className="flex items-center gap-3 w-full px-4 py-3 text-[15px] text-green-500 hover:bg-secondary/60 transition-colors"
        >
          <Undo2 className="size-5" />
          <span>Undo repost</span>
        </button>
      ) : (
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleRepost();
          }}
          className="flex items-center gap-3 w-full px-4 py-3 text-[15px] text-foreground hover:bg-secondary/60 transition-colors"
        >
          <RepostIcon className="size-5" />
          <span>Repost</span>
        </button>
      )}
      <button
        onClick={(e) => {
          e.stopPropagation();
          handleQuote();
        }}
        className="flex items-center gap-3 w-full px-4 py-3 text-[15px] text-foreground hover:bg-secondary/60 transition-colors"
      >
        <Quote className="size-5" />
        <span>Quote post</span>
      </button>
    </div>
  );

  const trigger = typeof children === 'function' ? children(isReposted) : children;

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild onClick={(e) => e.stopPropagation()}>
          {trigger}
        </PopoverTrigger>
        <PopoverContent 
          className="w-48 p-0 rounded-xl overflow-hidden"
          align="start"
          side="top"
          onClick={(e) => e.stopPropagation()}
        >
          {menuContent}
        </PopoverContent>
      </Popover>
      <ReplyComposeModal 
        quotedEvent={event}
        open={quoteOpen}
        onOpenChange={setQuoteOpen}
      />
    </>
  );
}
