import { Repeat2, Quote } from 'lucide-react';
import { useState } from 'react';
import type { NostrEvent } from '@nostrify/nostrify';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Drawer, DrawerContent, DrawerTrigger } from '@/components/ui/drawer';
import { ReplyComposeModal } from '@/components/ReplyComposeModal';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/useToast';

interface RepostMenuProps {
  event: NostrEvent;
  children: React.ReactNode;
}

export function RepostMenu({ event, children }: RepostMenuProps) {
  const isMobile = useIsMobile();
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
          // Invalidate stats to refetch counts
          queryClient.invalidateQueries({ queryKey: ['event-stats', event.id] });
          queryClient.invalidateQueries({ queryKey: ['event-interactions', event.id] });
        },
        onError: () => {
          toast({ title: 'Failed to repost', variant: 'destructive' });
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
        <Repeat2 className="size-5" />
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
      {isMobile && (
        <>
          <div className="h-px bg-border my-1" />
          <button
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
            }}
            className="flex items-center justify-center w-full px-4 py-3 text-[15px] text-muted-foreground hover:bg-secondary/60 transition-colors"
          >
            Close
          </button>
        </>
      )}
    </div>
  );

  if (isMobile) {
    return (
      <>
        <Drawer open={open} onOpenChange={setOpen}>
          <DrawerTrigger asChild onClick={(e) => e.stopPropagation()}>
            {children}
          </DrawerTrigger>
          <DrawerContent className="px-0 pb-2">
            {menuContent}
          </DrawerContent>
        </Drawer>
        <ReplyComposeModal 
          quotedEvent={event}
          open={quoteOpen}
          onOpenChange={setQuoteOpen}
        />
      </>
    );
  }

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
