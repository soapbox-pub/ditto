import { useCallback, useRef, useState } from 'react';
import { Heart } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { QuickReactMenu } from '@/components/QuickReactMenu';
import { ReactionEmoji } from '@/components/CustomEmoji';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useToast } from '@/hooks/useToast';
import {
  useExternalUserReaction,
  useExternalReactionCount,
} from '@/hooks/useExternalReactions';
import { formatNumber } from '@/lib/formatNumber';
import { cn } from '@/lib/utils';
import type { ExternalContent } from '@/lib/externalContent';

// ---------------------------------------------------------------------------
// Helper: NIP-73 k tag value
// ---------------------------------------------------------------------------

function getExternalKTag(content: ExternalContent): string {
  switch (content.type) {
    case 'url': return 'web';
    case 'isbn': return 'isbn';
    case 'iso3166': return 'iso3166';
    default: return 'web';
  }
}

// ---------------------------------------------------------------------------
// ExternalReactionButton
// ---------------------------------------------------------------------------

interface ExternalReactionButtonProps {
  /** Parsed NIP-73 external content. */
  content: ExternalContent;
  /** Icon size class (default "size-5"). */
  iconSize?: string;
  /** Extra class names on the trigger button. */
  className?: string;
}

/**
 * A fully-featured reaction button for NIP-73 external content.
 *
 * Includes hover-to-open emoji picker via `QuickReactMenu`, optimistic UI,
 * and displays the user's existing reaction & total count.
 */
export function ExternalReactionButton({ content, iconSize = 'size-5', className }: ExternalReactionButtonProps) {
  const { user } = useCurrentUser();
  const { mutate: publishEvent } = useNostrPublish();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const identifier = content.value;

  const userReactionData = useExternalUserReaction(content);
  const reactionCount = useExternalReactionCount(content);

  const hasReacted = !!userReactionData;
  const userEmoji = userReactionData?.emoji;
  const userReactionTags = userReactionData?.tags;

  // Popover state
  const [reactOpen, setReactOpen] = useState(false);
  const closeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const justClosedRef = useRef(false);
  const pickerExpandedRef = useRef(false);

  const handleMouseEnter = useCallback(() => {
    if (!user) return;
    if (justClosedRef.current) return;
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    setReactOpen(true);
  }, [user]);

  const handleMouseLeave = useCallback(() => {
    if (pickerExpandedRef.current) return;
    closeTimeoutRef.current = setTimeout(() => setReactOpen(false), 150);
  }, []);

  // Publish kind 17 reaction
  const handleReact = useCallback((emoji: string, emojiTag?: string[]) => {
    if (!user) return;

    const tags: string[][] = [
      ['k', getExternalKTag(content)],
      ['i', identifier],
    ];
    if (emojiTag) tags.push(emojiTag);

    queryClient.setQueryData(['external-user-reaction', identifier], { emoji: emoji || '+', tags });
    queryClient.setQueryData(['external-reaction-count', identifier], (prev: number | undefined) => (prev ?? 0) + 1);

    publishEvent(
      {
        kind: 17,
        content: emoji,
        created_at: Math.floor(Date.now() / 1000),
        tags,
      },
      {
        onSuccess: () => {
          setTimeout(() => {
            queryClient.invalidateQueries({ queryKey: ['external-user-reaction', identifier] });
            queryClient.invalidateQueries({ queryKey: ['external-reaction-count', identifier] });
          }, 3000);
        },
        onError: () => {
          toast({ title: 'Failed to react', variant: 'destructive' });
          queryClient.setQueryData(['external-user-reaction', identifier], null);
          queryClient.setQueryData(['external-reaction-count', identifier], (prev: number | undefined) => Math.max(0, (prev ?? 1) - 1));
        },
      },
    );
  }, [user, content, identifier, publishEvent, queryClient, toast]);

  return (
    <Popover open={reactOpen} onOpenChange={(open) => {
      if (open && justClosedRef.current) return;
      if (!open) pickerExpandedRef.current = false;
      setReactOpen(open);
    }}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            'flex items-center gap-1.5 p-2 rounded-full transition-colors',
            hasReacted
              ? 'text-pink-500'
              : 'text-muted-foreground hover:text-pink-500 hover:bg-pink-500/10',
            className,
          )}
          title="React"
          onClick={(e) => {
            e.stopPropagation();
            if (!user) return;
            if (justClosedRef.current) return;
            setReactOpen((prev) => !prev);
          }}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {hasReacted && userEmoji ? (
            <span className={cn(iconSize, 'flex items-center justify-center text-base leading-none')}>
              <ReactionEmoji content={userEmoji} tags={userReactionTags} className={iconSize} />
            </span>
          ) : (
            <Heart className={iconSize} />
          )}
          {reactionCount > 0 && (
            <span className="text-sm tabular-nums">{formatNumber(reactionCount)}</span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-auto p-0 border-0 bg-transparent shadow-none"
        side="top"
        align="start"
        onClick={(e) => e.stopPropagation()}
        onOpenAutoFocus={(e) => e.preventDefault()}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <QuickReactMenu
          eventId={identifier}
          eventPubkey=""
          eventKind={17}
          onExpandChange={(expanded) => { pickerExpandedRef.current = expanded; }}
          onClose={() => {
            pickerExpandedRef.current = false;
            justClosedRef.current = true;
            setReactOpen(false);
            setTimeout(() => { justClosedRef.current = false; }, 300);
          }}
          onReact={handleReact}
        />
      </PopoverContent>
    </Popover>
  );
}
