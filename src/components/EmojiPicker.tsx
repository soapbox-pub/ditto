import { useCallback } from 'react';
import Picker from '@emoji-mart/react';
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

export function EmojiPicker({ onSelect }: EmojiPickerProps) {
  const { theme } = useTheme();

  const handleSelect = useCallback((emoji: EmojiMartEmoji) => {
    if (emoji.native) {
      onSelect(emoji.native);
    }
  }, [onSelect]);

  return (
    <div
      className="emoji-mart-wrapper"
      onWheel={(e) => {
        // Prevent scroll from bubbling to the page
        e.stopPropagation();
      }}
    >
      <Picker
        data={data}
        onEmojiSelect={handleSelect}
        theme={theme === 'dark' ? 'dark' : 'light'}
        previewPosition="none"
        skinTonePosition="search"
        set="native"
        maxFrequentRows={2}
        navPosition="bottom"
        perLine={8}
      />
    </div>
  );
}
