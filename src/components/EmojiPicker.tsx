import { useCallback, useEffect, useRef, useMemo } from 'react';
import { Picker } from 'emoji-mart';
import data from '@emoji-mart/data';
import { useTheme } from '@/hooks/useTheme';
import type { CustomEmoji } from '@/hooks/useCustomEmojis';

/** A native Unicode emoji selection. */
export interface NativeEmojiSelection {
  type: 'native';
  emoji: string;
}

/** A custom NIP-30 emoji selection. */
export interface CustomEmojiSelection {
  type: 'custom';
  shortcode: string;
  url: string;
}

export type EmojiSelection = NativeEmojiSelection | CustomEmojiSelection;

interface EmojiPickerProps {
  onSelect: (selection: EmojiSelection) => void;
  /** NIP-30 custom emojis to display in a dedicated tab. */
  customEmojis?: CustomEmoji[];
}

interface EmojiMartEmoji {
  id: string;
  native?: string;
  shortcodes?: string;
  unified?: string;
  /** Present for custom emojis — the image URL from `skins[0].src`. */
  src?: string;
}

/**
 * Emoji picker that manages the emoji-mart Picker (a Web Component) imperatively.
 *
 * We bypass `@emoji-mart/react` because it creates `new Picker()` inside a
 * `useEffect`, which can trigger "Failed to construct 'HTMLElement': Illegal
 * constructor" when React unmounts and remounts the component (e.g. popovers,
 * strict mode). By attaching the picker to a ref-managed container and only
 * creating it once per mount, we avoid the illegal constructor error.
 *
 * Custom NIP-30 emojis are added via emoji-mart's `custom` prop, which renders
 * them in a dedicated tab alongside the standard Unicode categories.
 */
export function EmojiPicker({ onSelect, customEmojis }: EmojiPickerProps) {
  const { theme } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const pickerRef = useRef<InstanceType<typeof Picker> | null>(null);
  const onSelectRef = useRef(onSelect);

  // Keep callback ref up to date without re-creating the picker.
  onSelectRef.current = onSelect;

  const handleSelect = useCallback((emoji: EmojiMartEmoji) => {
    if (emoji.src) {
      // Custom emoji — has an image URL
      onSelectRef.current({
        type: 'custom',
        shortcode: emoji.id,
        url: emoji.src,
      });
    } else if (emoji.native) {
      // Native Unicode emoji
      onSelectRef.current({
        type: 'native',
        emoji: emoji.native,
      });
    }
  }, []);

  // Build emoji-mart custom categories from NIP-30 emoji list
  const customCategories = useMemo(() => {
    if (!customEmojis || customEmojis.length === 0) return undefined;
    return [{
      id: 'custom-nostr',
      name: 'Custom',
      emojis: customEmojis.map((e) => ({
        id: e.shortcode,
        name: e.shortcode,
        keywords: [e.shortcode],
        skins: [{ src: e.url }],
      })),
    }];
  }, [customEmojis]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Create the picker and let it append itself to our container div.
    const pickerOptions: Record<string, unknown> = {
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
    };

    if (customCategories) {
      pickerOptions.custom = customCategories;
    }

    const picker = new Picker(pickerOptions);
    pickerRef.current = picker;

    return () => {
      // Clean up: remove the picker's custom element from the DOM.
      pickerRef.current = null;
      while (container.firstChild) {
        container.removeChild(container.firstChild);
      }
    };
    // We intentionally depend only on mount/unmount + theme + custom emojis.
    // The handleSelect callback uses a ref so it never goes stale.
  }, [theme, handleSelect, customCategories]);

  return (
    <div
      ref={containerRef}
      className="emoji-mart-wrapper"
      onWheel={(e) => {
        // Prevent scroll from bubbling to the page
        e.stopPropagation();
      }}
    />
  );
}
