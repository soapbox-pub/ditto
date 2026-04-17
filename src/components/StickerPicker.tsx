import { useState, useMemo, useRef, useEffect } from 'react';
import { Search, X, Sticker } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { CustomEmojiImg } from '@/components/CustomEmoji';
import type { CustomEmoji } from '@/hooks/useCustomEmojis';

interface StickerPickerProps {
  customEmojis: CustomEmoji[];
  onSelect: (emoji: CustomEmoji) => void;
  /** Fixed height for the picker. Defaults to 350px. */
  height?: number;
  /** Auto-focus the search input on mount (default true on desktop). */
  autoFocus?: boolean;
}

export function StickerPicker({ customEmojis, onSelect, height = 350, autoFocus = true }: StickerPickerProps) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus) {
      const timer = setTimeout(() => inputRef.current?.focus(), 100);
      return () => clearTimeout(timer);
    }
  }, [autoFocus]);

  const filtered = useMemo(() => {
    if (!query.trim()) return customEmojis;
    const q = query.toLowerCase();
    return customEmojis.filter((e) => e.shortcode.toLowerCase().includes(q));
  }, [customEmojis, query]);

  if (customEmojis.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center text-muted-foreground gap-2" style={{ height }}>
        <Sticker className="size-8 opacity-40" />
        <p className="text-sm">No sticker packs yet</p>
        <p className="text-xs">Add emoji packs to your profile to use stickers</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col" style={{ height }}>
      {/* Search input */}
      <div className="px-3 pt-3 pb-2 shrink-0">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search stickers..."
            className="pl-8 pr-8 h-9 text-base md:text-sm bg-muted/50 border-0 rounded-lg"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Results */}
      <ScrollArea className="flex-1 min-h-0">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <p className="text-sm">No stickers found</p>
            <p className="text-xs mt-1">Try a different search term</p>
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-1.5 p-2">
            {filtered.map((emoji) => (
              <button
                key={emoji.shortcode}
                type="button"
                title={emoji.shortcode}
                onClick={() => onSelect(emoji)}
                className="aspect-square rounded-lg overflow-hidden hover:bg-muted transition-colors p-1 group"
              >
                <CustomEmojiImg
                  name={emoji.shortcode}
                  url={emoji.url}
                  className="w-full h-full object-contain group-hover:scale-110 transition-transform duration-150"
                />
              </button>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
