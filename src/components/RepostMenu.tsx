import { Quote } from 'lucide-react';
import { RepostIcon } from '@/components/icons/RepostIcon';
import { useState } from 'react';
import type { NostrEvent } from '@nostrify/nostrify';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ReplyComposeModal } from '@/components/ReplyComposeModal';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/useToast';
import type { EventStats } from '@/hooks/useTrending';

interface RepostMenuProps {
  event: NostrEvent;
  children: React.ReactNode;
}

export function RepostMenu({ event, children }: RepostMenuProps) {
  const [open, setOpen] = useState(false);
  const [quoteOpen, setQuoteOpen] = useState(false);
  const { user } = useCurrentUser();
  const { mutate: publishEvent } = useNostrPublish();
  const queryClient = useQueryClient();
  const { toast } = useToast();

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
          // Without this, the refetch returns stale counts and overwrites
          // the optimistic update.
          setTimeout(() => {
            queryClient.invalidateQueries({ queryKey: ['event-stats', event.id] });
            queryClient.invalidateQueries({ queryKey: ['event-interactions', event.id] });
          }, 3000);
        },
        onError: () => {
          toast({ title: 'Failed to repost', variant: 'destructive' });
          // Revert optimistic update
          if (prevStats) {
            queryClient.setQueryData<EventStats>(['event-stats', event.id], prevStats);
          }
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

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild onClick={(e) => e.stopPropagation()}>
          {children}
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
