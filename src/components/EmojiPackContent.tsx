import { useMemo, useState, useCallback } from 'react';
import { Plus, Check, Loader2, ExternalLink } from 'lucide-react';
import type { NostrEvent } from '@nostrify/nostrify';
import { useQueryClient } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useUserEmojiPacks } from '@/hooks/useUserEmojiPacks';
import { useToast } from '@/hooks/useToast';
import { cn } from '@/lib/utils';

/** Maximum emojis to show in the preview grid before truncating. */
const PREVIEW_LIMIT = 24;

/** Parsed emoji pack data. */
export interface EmojiPackData {
  identifier: string;
  name: string;
  picture?: string;
  about?: string;
  emojis: Array<{ shortcode: string; url: string }>;
}

/** Parse a kind 30030 emoji pack event into structured data. */
export function parseEmojiPack(event: NostrEvent): EmojiPackData | null {
  if (event.kind !== 30030) return null;

  const identifier = event.tags.find(([n]) => n === 'd')?.[1];
  if (!identifier) return null;

  const name = event.tags.find(([n]) => n === 'name')?.[1] || identifier;
  const picture = event.tags.find(([n]) => n === 'picture')?.[1];
  const about = event.tags.find(([n]) => n === 'about')?.[1];

  const emojis: Array<{ shortcode: string; url: string }> = [];
  for (const tag of event.tags) {
    if (tag[0] === 'emoji' && tag[1] && tag[2]) {
      emojis.push({ shortcode: tag[1], url: tag[2] });
    }
  }

  return { identifier, name, picture, about, emojis };
}

interface EmojiPackContentProps {
  event: NostrEvent;
}

/**
 * Renders an emoji pack (kind 30030) as an inline card in the feed.
 * Shows the pack name, description, emoji grid preview, and an add/remove button.
 */
export function EmojiPackContent({ event }: EmojiPackContentProps) {
  const pack = useMemo(() => parseEmojiPack(event), [event]);
  const { user } = useCurrentUser();
  const { mutateAsync: publishEvent } = useNostrPublish();
  const { data: userPacks } = useUserEmojiPacks();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isPending, setIsPending] = useState(false);

  // Check if user already has this pack in their kind 10030 list
  const packRef = `30030:${event.pubkey}:${pack?.identifier ?? ''}`;
  const isAdded = useMemo(() => {
    if (!userPacks?.emojiListEvent) return false;
    return userPacks.emojiListEvent.tags.some(
      ([n, v]) => n === 'a' && v === packRef,
    );
  }, [userPacks?.emojiListEvent, packRef]);

  const handleTogglePack = useCallback(async () => {
    if (!user || !pack) return;
    setIsPending(true);

    try {
      // Get existing kind 10030 tags or start fresh
      const existingTags = userPacks?.emojiListEvent?.tags.filter(
        ([n]) => n === 'emoji' || n === 'a',
      ) ?? [];

      let newTags: string[][];
      if (isAdded) {
        // Remove this pack reference
        newTags = existingTags.filter(
          ([n, v]) => !(n === 'a' && v === packRef),
        );
      } else {
        // Add this pack reference
        newTags = [...existingTags, ['a', packRef]];
      }

      await publishEvent({
        kind: 10030,
        content: '',
        tags: newTags,
      });

      queryClient.invalidateQueries({ queryKey: ['user-emoji-packs'] });
      toast({
        title: isAdded ? 'Pack removed' : 'Pack added',
        description: isAdded
          ? `"${pack.name}" removed from your emoji collection.`
          : `"${pack.name}" added to your emoji collection!`,
      });
    } catch (error) {
      console.error('Failed to update emoji list:', error);
      toast({
        title: 'Failed',
        description: 'Could not update your emoji collection.',
        variant: 'destructive',
      });
    } finally {
      setIsPending(false);
    }
  }, [user, pack, userPacks, isAdded, packRef, publishEvent, queryClient, toast]);

  if (!pack) return null;

  const showEmojis = pack.emojis.slice(0, PREVIEW_LIMIT);
  const remaining = pack.emojis.length - PREVIEW_LIMIT;

  return (
    <div className="mt-3 space-y-3">
      {/* Pack header */}
      <div className="flex items-start gap-3">
        {pack.picture && (
          <img
            src={pack.picture}
            alt={pack.name}
            className="size-12 rounded-lg object-cover shrink-0 border border-border"
          />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-[15px] truncate">{pack.name}</h3>
            <Badge variant="secondary" className="text-[10px] shrink-0">
              {pack.emojis.length} emoji{pack.emojis.length !== 1 ? 's' : ''}
            </Badge>
          </div>
          {pack.about && (
            <p className="text-sm text-muted-foreground line-clamp-2 mt-0.5">{pack.about}</p>
          )}
        </div>
      </div>

      {/* Emoji grid preview */}
      {showEmojis.length > 0 && (
        <div className="rounded-xl border border-border bg-secondary/30 p-3">
          <div className="flex flex-wrap gap-1.5">
            {showEmojis.map((emoji) => (
              <div
                key={emoji.shortcode}
                className="group relative"
                title={`:${emoji.shortcode}:`}
              >
                <img
                  src={emoji.url}
                  alt={`:${emoji.shortcode}:`}
                  className="size-8 object-contain rounded transition-transform group-hover:scale-125"
                  loading="lazy"
                  decoding="async"
                />
              </div>
            ))}
            {remaining > 0 && (
              <div className="flex items-center justify-center size-8 rounded bg-muted text-muted-foreground text-xs font-medium">
                +{remaining}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
        {user && (
          <Button
            variant={isAdded ? 'secondary' : 'default'}
            size="sm"
            className={cn(
              'h-8 text-xs gap-1.5',
              isAdded && 'text-muted-foreground',
            )}
            disabled={isPending}
            onClick={handleTogglePack}
          >
            {isPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : isAdded ? (
              <Check className="size-3.5" />
            ) : (
              <Plus className="size-3.5" />
            )}
            {isAdded ? 'Added' : 'Add to Collection'}
          </Button>
        )}
        <a
          href="https://emojiverse.shakespeare.wtf"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-muted-foreground hover:text-primary transition-colors flex items-center gap-1"
        >
          <ExternalLink className="size-3" />
          EmojiVerse
        </a>
      </div>
    </div>
  );
}
