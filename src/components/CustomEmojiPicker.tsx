import { useState, useMemo, useCallback } from 'react';
import { Search, SmilePlus } from 'lucide-react';
import { Link } from 'react-router-dom';

import { useUserEmojiPacks, type CustomEmojiEntry } from '@/hooks/useUserEmojiPacks';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface CustomEmojiPickerProps {
  /**
   * Called when a custom emoji is selected.
   * Returns the shortcode (e.g. "soapbox") and URL so the caller
   * can insert `:shortcode:` into content and add the emoji tag.
   */
  onSelect: (emoji: CustomEmojiEntry) => void;
}

/**
 * A picker grid for the user's custom NIP-30 emojis.
 * Shows all emojis from the user's kind 10030 list and referenced kind 30030 packs.
 */
export function CustomEmojiPicker({ onSelect }: CustomEmojiPickerProps) {
  const { data, isLoading } = useUserEmojiPacks();
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!data?.emojis) return [];
    if (!search) return data.emojis;
    const q = search.toLowerCase();
    return data.emojis.filter((e) =>
      e.shortcode.toLowerCase().includes(q) ||
      e.packName?.toLowerCase().includes(q),
    );
  }, [data?.emojis, search]);

  // Group by pack name
  const groups = useMemo(() => {
    const map = new Map<string, CustomEmojiEntry[]>();
    for (const emoji of filtered) {
      const key = emoji.packName ?? 'Standalone';
      const arr = map.get(key) ?? [];
      arr.push(emoji);
      map.set(key, arr);
    }
    return Array.from(map.entries());
  }, [filtered]);

  const handleSelect = useCallback((emoji: CustomEmojiEntry) => {
    onSelect(emoji);
  }, [onSelect]);

  if (isLoading) {
    return (
      <div className="w-[280px] p-4 space-y-3">
        <Skeleton className="h-8 w-full rounded-lg" />
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: 14 }).map((_, i) => (
            <Skeleton key={i} className="size-8 rounded" />
          ))}
        </div>
      </div>
    );
  }

  if (!data?.emojis.length) {
    return (
      <div className="w-[280px] p-6 text-center space-y-3">
        <SmilePlus className="size-8 mx-auto text-muted-foreground" />
        <div>
          <p className="text-sm font-medium">No custom emojis</p>
          <p className="text-xs text-muted-foreground mt-1">
            Add emoji packs from the{' '}
            <Link to="/emoji-packs" className="text-primary hover:underline">
              Emoji Packs
            </Link>{' '}
            feed or{' '}
            <a
              href="https://emojiverse.shakespeare.wtf"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              EmojiVerse
            </a>
            .
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-[280px] flex flex-col max-h-[350px]">
      {/* Search */}
      <div className="px-3 pt-3 pb-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search custom emojis..."
            className="w-full h-8 pl-8 pr-3 text-sm rounded-lg bg-secondary border-none outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground"
          />
        </div>
      </div>

      {/* Emoji grid */}
      <div className="flex-1 overflow-y-auto px-3 pb-3" onWheel={(e) => e.stopPropagation()}>
        {groups.length === 0 && search && (
          <p className="text-xs text-muted-foreground text-center py-4">
            No matching emojis
          </p>
        )}
        {groups.map(([groupName, emojis]) => (
          <div key={groupName} className="mb-2">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1 px-0.5">
              {groupName}
            </p>
            <div className="grid grid-cols-7 gap-0.5">
              {emojis.map((emoji) => (
                <button
                  key={emoji.shortcode}
                  onClick={() => handleSelect(emoji)}
                  className={cn(
                    'flex items-center justify-center size-9 rounded-lg transition-all',
                    'hover:bg-secondary hover:scale-110 active:scale-95',
                  )}
                  title={`:${emoji.shortcode}:`}
                >
                  <img
                    src={emoji.url}
                    alt={`:${emoji.shortcode}:`}
                    className="size-6 object-contain"
                    loading="lazy"
                    decoding="async"
                  />
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
