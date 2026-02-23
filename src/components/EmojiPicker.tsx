import { useCallback, useEffect, useRef } from 'react';
import { Picker } from 'emoji-mart';
import data from '@emoji-mart/data';
import { useTheme } from '@/hooks/useTheme';

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
}

interface EmojiMartEmoji {
  id: string;
  native: string;
  shortcodes: string;
  unified: string;
}

/**
 * Emoji picker that manages the emoji-mart Picker (a Web Component) imperatively.
 *
 * We bypass `@emoji-mart/react` because it creates `new Picker()` inside a
 * `useEffect`, which can trigger "Failed to construct 'HTMLElement': Illegal
 * constructor" when React unmounts and remounts the component (e.g. popovers,
 * strict mode). By attaching the picker to a ref-managed container and only
 * creating it once per mount, we avoid the illegal constructor error.
 */
export function EmojiPicker({ onSelect }: EmojiPickerProps) {
  const { theme } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const pickerRef = useRef<InstanceType<typeof Picker> | null>(null);
  const onSelectRef = useRef(onSelect);

  // Keep callback ref up to date without re-creating the picker.
  onSelectRef.current = onSelect;

  const handleSelect = useCallback((emoji: EmojiMartEmoji) => {
    if (emoji.native) {
      onSelectRef.current(emoji.native);
    }
  }, []);

  useEffect(() => {
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
    // We intentionally depend only on mount/unmount + theme.
    // The handleSelect callback uses a ref so it never goes stale.
  }, [theme, handleSelect]);

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
