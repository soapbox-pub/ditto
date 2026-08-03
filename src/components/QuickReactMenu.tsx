import { lazy, Suspense, useState, useCallback, useMemo } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import type { NostrEvent } from '@nostrify/nostrify';

import { CustomEmojiImg } from '@/components/CustomEmoji';
import type { EmojiSelection } from '@/components/EmojiPicker';

// The emoji picker (data + UI) is ~500 kB raw; lazy-load it so it only
// downloads when someone actually expands the full picker.
const EmojiPicker = lazy(() => import('@/components/EmojiPicker').then(m => ({ default: m.EmojiPicker })));
import { isCustomEmoji } from '@/lib/customEmoji';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { rebroadcastEvent } from '@/lib/rebroadcastEvent';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useEmojiUsage } from '@/hooks/useEmojiUsage';
import { useCustomEmojis } from '@/hooks/useCustomEmojis';
import { useFeedSettings } from '@/hooks/useFeedSettings';
import { cn } from '@/lib/utils';
import { impactMedium } from '@/lib/haptics';
import type { EventStats } from '@/hooks/useTrending';
import type { ResolvedEmoji } from '@/lib/customEmoji';

interface QuickReactMenuProps {
  /** The event ID being reacted to. */
  eventId: string;
  /** The pubkey of the event author. */
  eventPubkey: string;
  /** The kind number of the event being reacted to. */
  eventKind: number;
  /**
   * The full event being reacted to. When provided, it is rebroadcast to relays
   * alongside the reaction (best-effort).
   */
  reactedEvent?: NostrEvent;
  /** Called after an emoji is selected so the parent can close the popover. */
  onClose?: () => void;
  /**
   * Called the moment a reaction is selected (both the default publish path
   * and the `onReact` delegate path) — for send-side feedback like the
   * reaction burst animation. Receives the selected emoji (custom emojis
   * arrive in `:shortcode:` form).
   */
  onReacted?: (emoji: string) => void;
  /** Called when the full picker is opened/closed so the parent can lock the popover open. */
  onExpandChange?: (expanded: boolean) => void;
  /**
   * Optional custom handler called when an emoji is selected.
   * When provided, this replaces the default kind 7 publish behavior.
   * The optional second argument is an emoji tag `['emoji', shortcode, url]` for custom emojis.
   */
  onReact?: (emoji: string, emojiTag?: string[]) => void;
  /** Optional extra class names. */
  className?: string;
}

export function QuickReactMenu({
  eventId,
  eventPubkey,
  eventKind,
  reactedEvent,
  onClose,
  onReacted,
  onExpandChange,
  onReact,
  className,
}: QuickReactMenuProps) {
  const { user } = useCurrentUser();
  const { nostr } = useNostr();
  const { mutate: publishEvent } = useNostrPublish();
  const queryClient = useQueryClient();
  const { trackEmojiUsage, getTopEmojis } = useEmojiUsage();
  const { feedSettings } = useFeedSettings();
  const { emojis: allCustomEmojis } = useCustomEmojis();
  const customEmojisEnabled = feedSettings.showCustomEmojis !== false;
  const customEmojis = useMemo(() => customEmojisEnabled ? allCustomEmojis : [], [customEmojisEnabled, allCustomEmojis]);

  const [showFullPicker, setShowFullPicker] = useState(false);
  const [selectedEmoji, setSelectedEmoji] = useState<string | null>(null);

  // Build a lookup map from shortcode -> url for custom emojis
  const customEmojiMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const e of customEmojis) {
      map.set(e.shortcode, e.url);
    }
    return map;
  }, [customEmojis]);

  // Get user's most-used emojis (or defaults), filtering out
  // custom emoji shortcodes that are no longer in the user's collection
  const quickEmojis = useMemo(() => {
    const top = getTopEmojis(8);
    return top
      .filter((emoji) => {
        if (!isCustomEmoji(emoji)) return true;
        const shortcode = emoji.slice(1, -1);
        return customEmojiMap.has(shortcode);
      })
      .slice(0, 6);
  }, [getTopEmojis, customEmojiMap]);

  /** Publish a reaction with a native Unicode emoji string. */
  const publishReaction = useCallback((emoji: string, emojiTag?: [string, string, string]) => {
    if (!user) return;
    impactMedium();

    // Close the entire popover
    onClose?.();

    // Send-side feedback (reaction burst) in the parent button
    onReacted?.((emoji === '+' || emoji === '') ? '👍' : emoji);

    // Set selected emoji for optimistic update
    setSelectedEmoji(emoji);

    // Track emoji usage for quick-react bar ordering
    trackEmojiUsage(emoji);

    // If a custom handler is provided, delegate to it
    if (onReact) {
      onReact(emoji, emojiTag);
      return;
    }

    // Optimistic update
    const displayEmoji = (emoji === '+' || emoji === '') ? '👍' : emoji;
    const resolvedEmoji: ResolvedEmoji = emojiTag
      ? { content: displayEmoji, url: emojiTag[2], name: emojiTag[1] }
      : { content: displayEmoji };
    const prevStats = queryClient.getQueryData<EventStats>(['event-stats', eventId]);
    if (prevStats) {
      queryClient.setQueryData<EventStats>(['event-stats', eventId], {
        ...prevStats,
        reactions: prevStats.reactions + 1,
        reactionEmojis: prevStats.reactionEmojis.some((e) => e.content === displayEmoji)
          ? prevStats.reactionEmojis
          : [...prevStats.reactionEmojis, resolvedEmoji],
      });
    }

    queryClient.setQueryData<ResolvedEmoji>(['user-reaction', eventId], resolvedEmoji);

    // Build tags
    const tags: string[][] = [
      ['e', eventId],
      ['p', eventPubkey],
      ['k', String(eventKind)],
    ];
    if (emojiTag) tags.push(emojiTag);

    // Publish kind 7 reaction
    publishEvent(
      {
        kind: 7,
        content: emoji,
        created_at: Math.floor(Date.now() / 1000),
        tags,
      },
      {
        onSuccess: () => {
          // Rebroadcast the original event alongside the reaction (best-effort).
          if (reactedEvent) rebroadcastEvent(nostr, reactedEvent);
          setTimeout(() => {
            queryClient.invalidateQueries({ queryKey: ['event-stats', eventId] });
            queryClient.invalidateQueries({ queryKey: ['event-interactions', eventId] });
          }, 3000);
        },
        onError: () => {
          setSelectedEmoji(null);
          if (prevStats) {
            queryClient.setQueryData<EventStats>(['event-stats', eventId], prevStats);
          }
          queryClient.removeQueries({ queryKey: ['user-reaction', eventId] });
        },
      },
    );
  }, [user, eventId, eventPubkey, eventKind, reactedEvent, nostr, onReact, publishEvent, queryClient, trackEmojiUsage, onClose, onReacted]);

  /** Handle selection from the quick buttons (native or custom emoji). */
  const handleQuickSelect = useCallback((emoji: string) => {
    if (isCustomEmoji(emoji)) {
      const shortcode = emoji.slice(1, -1);
      const url = customEmojiMap.get(shortcode);
      if (url) {
        publishReaction(emoji, ['emoji', shortcode, url]);
        return;
      }
    }
    publishReaction(emoji);
  }, [publishReaction, customEmojiMap]);

  /** Handle selection from the full EmojiPicker (native or custom). */
  const handlePickerSelect = useCallback((selection: EmojiSelection) => {
    if (selection.type === 'native') {
      publishReaction(selection.emoji);
    } else {
      // Custom NIP-30 emoji — content is :shortcode:, with emoji tag
      publishReaction(
        `:${selection.shortcode}:`,
        ['emoji', selection.shortcode, selection.url],
      );
    }
  }, [publishReaction]);

  if (!user) return null;

  if (showFullPicker) {
    return (
      <div
        className={cn('rounded-xl shadow-xl overflow-hidden bg-popover border border-border', className)}
        onClick={(e) => e.stopPropagation()}
      >
        <Suspense fallback={<div className="w-[352px] max-w-[90vw] h-[400px] flex items-center justify-center text-sm text-muted-foreground">Loading…</div>}>
          <EmojiPicker customEmojis={customEmojis} onSelect={handlePickerSelect} />
        </Suspense>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1 p-1.5 rounded-full bg-popover border border-border shadow-lg',
        className,
      )}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Quick emoji buttons */}
      {quickEmojis.map((emoji) => {
        const isCustom = isCustomEmoji(emoji);
        const shortcode = isCustom ? emoji.slice(1, -1) : undefined;
        const customUrl = shortcode ? customEmojiMap.get(shortcode) : undefined;

        return (
          <button
            key={emoji}
            onClick={() => handleQuickSelect(emoji)}
            className={cn(
              'flex items-center justify-center size-9 rounded-full text-xl transition-all focus:outline-none hover:bg-secondary hover:scale-110 active:scale-95',
              selectedEmoji === emoji && 'bg-secondary scale-110',
            )}
            title={`React with ${isCustom ? shortcode : emoji}`}
          >
            {customUrl ? (
              <CustomEmojiImg
                name={shortcode ?? emoji}
                url={customUrl}
                className="size-6 object-contain"
              />
            ) : (
              emoji
            )}
          </button>
        );
      })}

      {/* More button to show full picker */}
      <button
        onClick={() => {
          setShowFullPicker(true);
          onExpandChange?.(true);
        }}
        className="flex items-center justify-center size-9 rounded-full text-muted-foreground transition-all focus:outline-none hover:bg-secondary hover:text-foreground hover:scale-110 active:scale-95"
        title="More reactions"
      >
        <MoreHorizontal className="size-5" />
      </button>
    </div>
  );
}
