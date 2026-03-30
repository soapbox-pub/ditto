import { useState, useRef, useCallback } from 'react';
import { SmilePlus } from 'lucide-react';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { QuickReactMenu } from '@/components/QuickReactMenu';
import { Button } from '@/components/ui/button';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useEmojiUsage } from '@/hooks/useEmojiUsage';
import { useToast } from '@/hooks/useToast';
import type { NostrEvent } from '@nostrify/nostrify';

interface ProfileReactionButtonProps {
  /** The kind 0 metadata event for the profile being reacted to. */
  profileEvent: NostrEvent;
  /** Optional extra class names for the trigger button. */
  className?: string;
}

/**
 * Emoji reaction button for user profiles.
 * Opens an emoji picker and publishes a kind 7 reaction targeting
 * the user's kind 0 profile event with `a`, `e`, and `p` tags.
 */
export function ProfileReactionButton({ profileEvent, className }: ProfileReactionButtonProps) {
  const { user } = useCurrentUser();
  const { mutate: publishEvent } = useNostrPublish();
  const { trackEmojiUsage } = useEmojiUsage();
  const { toast } = useToast();
  const [menuOpen, setMenuOpen] = useState(false);
  const pickerExpandedRef = useRef(false);
  const justClosedRef = useRef(false);

  const handleReact = useCallback((emoji: string, emojiTag?: string[]) => {
    if (!user) return;

    trackEmojiUsage(emoji);

    const tags: string[][] = [
      ['e', profileEvent.id],
      ['p', profileEvent.pubkey],
      ['a', `0:${profileEvent.pubkey}:`],
      ['k', '0'],
    ];
    if (emojiTag) tags.push(emojiTag);

    publishEvent(
      {
        kind: 7,
        content: emoji,
        created_at: Math.floor(Date.now() / 1000),
        tags,
      },
      {
        onSuccess: () => {
          toast({ title: 'Reaction sent!' });
        },
      },
    );
  }, [user, profileEvent, publishEvent, trackEmojiUsage, toast]);

  if (!user) return null;

  return (
    <Popover
      open={menuOpen}
      onOpenChange={(open) => {
        if (open && justClosedRef.current) return;
        if (!open) pickerExpandedRef.current = false;
        setMenuOpen(open);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className={className ?? 'rounded-full size-10'}
          title="React to this profile"
          onClick={(e) => {
            e.stopPropagation();
            if (justClosedRef.current) return;
            setMenuOpen((prev) => !prev);
          }}
        >
          <SmilePlus className="size-5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-auto p-0 border-0 bg-transparent shadow-none"
        side="top"
        align="start"
        onClick={(e) => e.stopPropagation()}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <QuickReactMenu
          eventId={profileEvent.id}
          eventPubkey={profileEvent.pubkey}
          eventKind={0}
          onReact={handleReact}
          onExpandChange={(expanded) => {
            pickerExpandedRef.current = expanded;
          }}
          onClose={() => {
            pickerExpandedRef.current = false;
            justClosedRef.current = true;
            setMenuOpen(false);
            setTimeout(() => {
              justClosedRef.current = false;
            }, 300);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
