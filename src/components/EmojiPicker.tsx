import { useState, useCallback, useEffect, useRef } from 'react';
import { Picker } from 'emoji-mart';
import data from '@emoji-mart/data';
import { useTheme } from '@/hooks/useTheme';
import { useUserEmojiPacks } from '@/hooks/useUserEmojiPacks';
import { CustomEmojiPicker } from '@/components/CustomEmojiPicker';
import { cn } from '@/lib/utils';
import type { CustomEmojiEntry } from '@/hooks/useUserEmojiPacks';

export interface EmojiPickerProps {
  /** Called when a native unicode emoji is selected. */
  onSelect: (emoji: string) => void;
  /**
   * Called when a custom NIP-30 emoji is selected.
   * If not provided, custom emojis are unavailable.
   */
  onCustomEmojiSelect?: (emoji: CustomEmojiEntry) => void;
}

interface EmojiMartEmoji {
  id: string;
  native: string;
  shortcodes: string;
  unified: string;
}

type PickerTab = 'native' | 'custom';

/**
 * Emoji picker that manages the emoji-mart Picker (a Web Component) imperatively.
 *
 * Includes a "Custom" tab for NIP-30 custom emojis from the user's emoji packs
 * when they have any configured.
 */
export function EmojiPicker({ onSelect, onCustomEmojiSelect }: EmojiPickerProps) {
  const { theme } = useTheme();
  const { data: userPacks } = useUserEmojiPacks();
  const containerRef = useRef<HTMLDivElement>(null);
  const pickerRef = useRef<InstanceType<typeof Picker> | null>(null);
  const onSelectRef = useRef(onSelect);

  const hasCustomEmojis = (userPacks?.emojis.length ?? 0) > 0;
  const [activeTab, setActiveTab] = useState<PickerTab>('native');

  // Keep callback ref up to date without re-creating the picker.
  onSelectRef.current = onSelect;

  const handleSelect = useCallback((emoji: EmojiMartEmoji) => {
    if (emoji.native) {
      onSelectRef.current(emoji.native);
    }
  }, []);

  useEffect(() => {
    if (activeTab !== 'native') return;

    const container = containerRef.current;
    if (!container) return;

    // Create the picker and let it append itself to our container div.
    const picker = new Picker({
      data,
      onEmojiSelect: handleSelect,
      theme: theme === 'dark' ? 'dark' : 'light',
      previewPosition: 'none',
      skinTonePosition: 'search',
      set: 'native',
      maxFrequentRows: 2,
      navPosition: 'bottom',
      perLine: 8,
      parent: container,
    });

    pickerRef.current = picker;

    return () => {
      // Clean up: remove the picker's custom element from the DOM.
      pickerRef.current = null;
      while (container.firstChild) {
        container.removeChild(container.firstChild);
      }
    };
  }, [theme, handleSelect, activeTab]);

  const handleCustomSelect = useCallback((emoji: CustomEmojiEntry) => {
    if (onCustomEmojiSelect) {
      onCustomEmojiSelect(emoji);
    } else {
      // Fallback: insert `:shortcode:` as text
      onSelectRef.current(`:${emoji.shortcode}:`);
    }
  }, [onCustomEmojiSelect]);

  // If no custom emojis and no handler, just show the native picker
  if (!hasCustomEmojis && !onCustomEmojiSelect) {
    return (
      <div
        ref={containerRef}
        className="emoji-mart-wrapper"
        onWheel={(e) => e.stopPropagation()}
      />
    );
  }

  return (
    <div className="flex flex-col">
      {/* Tab bar */}
      {hasCustomEmojis && (
        <div className="flex border-b border-border">
          <button
            className={cn(
              'flex-1 py-2 text-xs font-medium transition-colors relative',
              activeTab === 'native'
                ? 'text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
            onClick={() => setActiveTab('native')}
          >
            Emoji
            {activeTab === 'native' && (
              <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full bg-primary" />
            )}
          </button>
          <button
            className={cn(
              'flex-1 py-2 text-xs font-medium transition-colors relative',
              activeTab === 'custom'
                ? 'text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
            onClick={() => setActiveTab('custom')}
          >
            Custom
            {activeTab === 'custom' && (
              <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full bg-primary" />
            )}
          </button>
        </div>
      )}

      {/* Tab content */}
      {activeTab === 'native' ? (
        <div
          ref={containerRef}
          className="emoji-mart-wrapper"
          onWheel={(e) => e.stopPropagation()}
        />
      ) : (
        <CustomEmojiPicker onSelect={handleCustomSelect} />
      )}
    </div>
  );
}
