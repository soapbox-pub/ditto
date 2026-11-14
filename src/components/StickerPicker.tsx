import { useState, useMemo, useRef, useEffect, useId } from 'react';
import { Search, X, Sticker } from 'lucide-react';
import { FormattedMessage, useIntl } from 'react-intl';
import { Input } from '@/components/ui/input';
import { CustomEmojiImg } from '@/components/CustomEmoji';
import type { CustomEmoji } from '@/hooks/useCustomEmojis';
import { paletteSections, type CustomEmojiSection } from '@/lib/customEmoji';

interface StickerPickerProps {
  customEmojis: CustomEmoji[];
  onSelect: (emoji: CustomEmoji) => void;
  /** Fixed height for the picker (px number or CSS length, e.g. '100%'). Defaults to 350px. */
  height?: number | string;
  /** Auto-focus the search input on mount (default true on desktop). */
  autoFocus?: boolean;
  /** Reports whether the user is actively searching (input focused or query non-empty). */
  onSearchActiveChange?: (active: boolean) => void;
}

export function StickerPicker({ customEmojis, onSelect, height = 350, autoFocus = true, onSearchActiveChange }: StickerPickerProps) {
  const intl = useIntl();
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const [searchFocused, setSearchFocused] = useState(false);

  // Report search activity so the container can give results more room.
  const searchActive = searchFocused || query.trim().length > 0;
  useEffect(() => {
    onSearchActiveChange?.(searchActive);
  }, [searchActive, onSearchActiveChange]);

  useEffect(() => {
    if (autoFocus) {
      const timer = setTimeout(() => inputRef.current?.focus(), 100);
      return () => clearTimeout(timer);
    }
  }, [autoFocus]);

  const sections = useMemo(() => {
    const all = paletteSections(customEmojis);
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all
      .map((section) => ({ ...section, emojis: section.emojis.filter((e) => e.shortcode.toLowerCase().includes(q)) }))
      .filter((section) => section.emojis.length > 0);
  }, [customEmojis, query]);

  if (customEmojis.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center text-muted-foreground gap-2" style={{ height }}>
        <Sticker className="size-8 opacity-40" />
        <p className="text-sm"><FormattedMessage id="stickerPicker.noPacks" defaultMessage="No sticker packs yet" /></p>
        <p className="text-xs"><FormattedMessage id="stickerPicker.noPacksHint" defaultMessage="Add emoji packs to your profile to use stickers" /></p>
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
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            placeholder={intl.formatMessage({ id: 'stickerPicker.searchPlaceholder', defaultMessage: 'Search stickers...' })}
            className="pl-8 pr-8 h-9 text-base md:text-sm bg-muted/50 border-0 rounded-full"
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

      {/* Results — native scroller so the dialog's scroll-lock allows touch scrolling */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
        {sections.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <p className="text-sm"><FormattedMessage id="stickerPicker.noResults" defaultMessage="No stickers found" /></p>
            <p className="text-xs mt-1"><FormattedMessage id="stickerPicker.noResultsHint" defaultMessage="Try a different search term" /></p>
          </div>
        ) : (
          <div className="flex flex-col gap-3 p-2">
            {sections.map((section) => (
              <StickerSection key={section.key} section={section} onSelect={onSelect} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StickerSection({ section, onSelect }: { section: CustomEmojiSection; onSelect: (emoji: CustomEmoji) => void }) {
  const intl = useIntl();
  const headingId = useId();
  return (
    <div role="group" aria-labelledby={headingId}>
      <div id={headingId} className="px-1 pb-1.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider truncate">
        {section.name ?? intl.formatMessage({ id: 'stickerPicker.custom', defaultMessage: 'Custom' })}
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        {section.emojis.map((emoji) => (
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
    </div>
  );
}
