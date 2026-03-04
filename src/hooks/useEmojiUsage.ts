import { useCallback } from 'react';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { useCurrentUser } from '@/hooks/useCurrentUser';

interface EmojiUsage {
  [emoji: string]: number;
}

// Default quick-react emojis
const DEFAULT_EMOJIS = ['🚀', '🔥', '💪', '🤙', '😂', '💀'];

/**
 * Hook to track and retrieve user's most-used emojis
 */
export function useEmojiUsage() {
  const { user } = useCurrentUser();
  const [emojiUsage, setEmojiUsage] = useLocalStorage<EmojiUsage>(
    user ? `emoji-usage-${user.pubkey}` : 'emoji-usage',
    {}
  );

  const trackEmojiUsage = useCallback((emoji: string) => {
    setEmojiUsage((prev) => ({
      ...prev,
      [emoji]: (prev[emoji] || 0) + 1,
    }));
  }, [setEmojiUsage]);

  const getTopEmojis = useCallback((count: number = 6): string[] => {
    // Sort emojis by usage count
    const sorted = Object.entries(emojiUsage)
      .sort(([, a], [, b]) => b - a)
      .map(([emoji]) => emoji);

    // Take top N used emojis
    const topUsed = sorted.slice(0, count);

    // Fill remaining slots with default emojis that aren't already in the list
    const remaining = count - topUsed.length;
    if (remaining > 0) {
      const usedSet = new Set(topUsed);
      const defaultsToAdd = DEFAULT_EMOJIS.filter((e) => !usedSet.has(e)).slice(0, remaining);
      return [...topUsed, ...defaultsToAdd];
    }

    return topUsed;
  }, [emojiUsage]);

  return {
    trackEmojiUsage,
    getTopEmojis,
  };
}
