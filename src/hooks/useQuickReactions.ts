import { useMemo } from 'react';

import type { QuickReaction } from '@/contexts/AppContext';
import { useAppContext } from '@/hooks/useAppContext';
import { useCustomEmojis } from '@/hooks/useCustomEmojis';
import { useEmojiUsage } from '@/hooks/useEmojiUsage';
import { useFeedSettings } from '@/hooks/useFeedSettings';
import { isCustomEmoji } from '@/lib/customEmoji';
import { MAX_QUICK_REACTIONS } from '@/lib/schemas';

/** A slot in the quick-react row. */
export interface QuickReactionSlot extends QuickReaction {
  /** Chosen by the user, rather than filled from their most-used emojis. */
  pinned: boolean;
}

/**
 * The quick-react row: the user's pinned emojis first, then their most-used
 * (or the defaults) in the slots left over. Learned custom emojis must still
 * be in the user's collection; pinned ones carry their own URL.
 */
export function useQuickReactions(): QuickReactionSlot[] {
  const { config } = useAppContext();
  const { getTopEmojis } = useEmojiUsage();
  const { feedSettings } = useFeedSettings();
  const { emojis: customEmojis } = useCustomEmojis();
  const customEmojisEnabled = feedSettings.showCustomEmojis !== false;

  const customEmojiMap = useMemo(() => {
    const map = new Map<string, string>();
    if (customEmojisEnabled) {
      for (const e of customEmojis) map.set(e.shortcode, e.url);
    }
    return map;
  }, [customEmojisEnabled, customEmojis]);

  return useMemo((): QuickReactionSlot[] => {
    const pinned = (config.quickReactions ?? [])
      .filter((r) => !isCustomEmoji(r.emoji) || (customEmojisEnabled && !!r.url))
      .map((r): QuickReactionSlot => ({ ...r, pinned: true }));
    const seen = new Set(pinned.map((r) => r.emoji));
    const learned = getTopEmojis(MAX_QUICK_REACTIONS + 2 + pinned.length).flatMap((emoji): QuickReactionSlot[] => {
      if (seen.has(emoji)) return [];
      if (!isCustomEmoji(emoji)) return [{ emoji, pinned: false }];
      const url = customEmojiMap.get(emoji.slice(1, -1));
      return url ? [{ emoji, url, pinned: false }] : [];
    });
    return [...pinned, ...learned].slice(0, MAX_QUICK_REACTIONS);
  }, [config.quickReactions, customEmojisEnabled, getTopEmojis, customEmojiMap]);
}
