import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import data from '@emoji-mart/data';
import { cn } from '@/lib/utils';

interface EmojiData {
  id: string;
  name: string;
  keywords?: string[];
  skins: Array<{ native: string }>;
}

interface EmojiShortcodeAutocompleteProps {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  content: string;
  onInsertEmoji: (params: { start: number; end: number; replacement: string }) => void;
}

/** CSS properties that affect text layout and must be copied to the mirror element. */
const MIRROR_PROPS = [
  'direction', 'boxSizing', 'width', 'height', 'overflowX', 'overflowY',
  'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
  'borderStyle', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'fontStyle', 'fontVariant', 'fontWeight', 'fontStretch', 'fontSize',
  'fontSizeAdjust', 'lineHeight', 'fontFamily', 'textAlign', 'textTransform',
  'textIndent', 'textDecoration', 'letterSpacing', 'wordSpacing',
  'tabSize', 'MozTabSize', 'whiteSpace', 'wordWrap', 'wordBreak',
] as const;

/**
 * Returns the pixel {top, left} of a character position within a textarea,
 * relative to the textarea element's top-left corner.
 */
function getCaretCoordinates(textarea: HTMLTextAreaElement, position: number): { top: number; left: number } {
  const mirror = document.createElement('div');
  mirror.id = 'emoji-mirror';

  const style = window.getComputedStyle(textarea);

  for (const prop of MIRROR_PROPS) {
    mirror.style[prop as string] = style.getPropertyValue(
      prop.replace(/([A-Z])/g, '-$1').toLowerCase(),
    );
  }

  mirror.style.position = 'absolute';
  mirror.style.visibility = 'hidden';
  mirror.style.whiteSpace = 'pre-wrap';
  mirror.style.wordWrap = 'break-word';
  mirror.style.overflow = 'hidden';

  document.body.appendChild(mirror);

  mirror.textContent = textarea.value.substring(0, position);

  const marker = document.createElement('span');
  marker.textContent = '\u200b';
  mirror.appendChild(marker);

  const mirrorRect = mirror.getBoundingClientRect();
  const markerRect = marker.getBoundingClientRect();

  const coords = {
    top: markerRect.top - mirrorRect.top - textarea.scrollTop,
    left: markerRect.left - mirrorRect.left - textarea.scrollLeft,
  };

  document.body.removeChild(mirror);
  return coords;
}

const MAX_RESULTS = 8;

/** Build a flat searchable list of emojis from emoji-mart data. */
function buildEmojiIndex(): Array<{ id: string; name: string; native: string; keywords: string[] }> {
  const emojis = (data as { emojis: Record<string, EmojiData>; aliases: Record<string, string> }).emojis;
  const aliases = (data as { aliases: Record<string, string> }).aliases;

  const results: Array<{ id: string; name: string; native: string; keywords: string[] }> = [];

  for (const [id, emoji] of Object.entries(emojis)) {
    const native = emoji.skins?.[0]?.native;
    if (!native) continue;

    // Collect all alias names that point to this emoji
    const aliasNames: string[] = [];
    for (const [alias, target] of Object.entries(aliases)) {
      if (target === id) {
        aliasNames.push(alias);
      }
    }

    results.push({
      id,
      name: emoji.name,
      native,
      keywords: [...(emoji.keywords || []), ...aliasNames],
    });
  }

  return results;
}

/** Lazily initialized emoji index. */
let emojiIndex: ReturnType<typeof buildEmojiIndex> | null = null;
function getEmojiIndex() {
  if (!emojiIndex) {
    emojiIndex = buildEmojiIndex();
  }
  return emojiIndex;
}

/** Search emojis by shortcode query. */
function searchEmojis(query: string): Array<{ id: string; name: string; native: string }> {
  if (!query) return [];
  const q = query.toLowerCase();
  const index = getEmojiIndex();
  const results: Array<{ id: string; name: string; native: string; score: number }> = [];

  for (const emoji of index) {
    // Exact id match gets highest priority
    if (emoji.id === q) {
      results.push({ ...emoji, score: 0 });
      continue;
    }
    // Id starts with query
    if (emoji.id.startsWith(q)) {
      results.push({ ...emoji, score: 1 });
      continue;
    }
    // Id contains query
    if (emoji.id.includes(q)) {
      results.push({ ...emoji, score: 2 });
      continue;
    }
    // Name starts with query
    if (emoji.name.toLowerCase().startsWith(q)) {
      results.push({ ...emoji, score: 3 });
      continue;
    }
    // Name contains query
    if (emoji.name.toLowerCase().includes(q)) {
      results.push({ ...emoji, score: 4 });
      continue;
    }
    // Keyword match
    if (emoji.keywords.some((kw) => kw.startsWith(q) || kw.includes(q))) {
      results.push({ ...emoji, score: 5 });
      continue;
    }
  }

  results.sort((a, b) => a.score - b.score);
  return results.slice(0, MAX_RESULTS);
}

/**
 * Detects `:shortcode` at the cursor position in a textarea and shows
 * an emoji autocomplete dropdown. On selection, replaces `:shortcode`
 * with the native emoji character in the content.
 */
export function EmojiShortcodeAutocomplete({
  textareaRef,
  content,
  onInsertEmoji,
}: EmojiShortcodeAutocompleteProps) {
  const [query, setQuery] = useState('');
  const [colonStart, setColonStart] = useState(-1);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number } | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const results = useMemo(() => searchEmojis(query), [query]);

  // Detect :shortcode query at cursor
  const detectShortcode = useCallback((text?: string, cursorPos?: number) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const cursor = cursorPos ?? textarea.selectionStart;
    const value = text ?? textarea.value;

    // Walk back from cursor to find a colon that starts a shortcode
    let colonPos = -1;
    for (let i = cursor - 1; i >= 0; i--) {
      const ch = value[i];
      // Stop at whitespace, newline, or another colon (closing a previous shortcode)
      if (ch === ' ' || ch === '\n' || ch === '\t') break;
      // If we find a closing colon (i.e. `:fire:` is already complete), bail
      if (ch === ':' && i < cursor - 1) {
        // This is our trigger colon — must be at start of text or preceded by whitespace
        if (i === 0 || /[\s]/.test(value[i - 1])) {
          colonPos = i;
        }
        break;
      }
      // If we hit the beginning of the string, no colon was found
    }

    if (colonPos === -1) {
      setIsOpen(false);
      setQuery('');
      setColonStart(-1);
      return;
    }

    const q = value.slice(colonPos + 1, cursor);

    // Don't show for empty query, very short query, or very long queries
    if (q.length < 2 || q.length > 32) {
      setIsOpen(false);
      setQuery('');
      setColonStart(-1);
      return;
    }

    // Don't show if the query contains a closing colon (already completed shortcode)
    if (q.includes(':')) {
      setIsOpen(false);
      setQuery('');
      setColonStart(-1);
      return;
    }

    setQuery(q);
    setColonStart(colonPos);
    setIsOpen(true);
    setSelectedIndex(0);

    // Position the dropdown below the : character
    const coords = getCaretCoordinates(textarea, colonPos);
    const lineHeight = parseFloat(window.getComputedStyle(textarea).lineHeight) || 20;
    setDropdownPos({
      top: coords.top + lineHeight + 4,
      left: Math.max(0, Math.min(coords.left, textarea.clientWidth - 280)),
    });
  }, [textareaRef]);

  // Listen for input/cursor changes on the textarea element
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const handleInput = () => {
      detectShortcode(textarea.value, textarea.selectionStart);
    };
    const handleClick = () => detectShortcode();
    const handleKeyUp = (e: KeyboardEvent) => {
      if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
        detectShortcode();
      }
    };

    textarea.addEventListener('input', handleInput);
    textarea.addEventListener('click', handleClick);
    textarea.addEventListener('keyup', handleKeyUp);

    return () => {
      textarea.removeEventListener('input', handleInput);
      textarea.removeEventListener('click', handleClick);
      textarea.removeEventListener('keyup', handleKeyUp);
    };
  }, [textareaRef, detectShortcode, content]);

  // Re-detect when content changes externally
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    detectShortcode(content, textarea.selectionStart);
  }, [content, detectShortcode, textareaRef]);

  // Handle keyboard navigation within the dropdown
  useEffect(() => {
    if (!isOpen || results.length === 0) return;

    const textarea = textareaRef.current;
    if (!textarea) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((prev) => (prev < results.length - 1 ? prev + 1 : 0));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((prev) => (prev > 0 ? prev - 1 : results.length - 1));
          break;
        case 'Enter':
        case 'Tab':
          if (results.length > 0) {
            e.preventDefault();
            selectEmoji(results[selectedIndex]);
          }
          break;
        case 'Escape':
          e.preventDefault();
          setIsOpen(false);
          break;
      }
    };

    textarea.addEventListener('keydown', handleKeyDown);
    return () => textarea.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, results, selectedIndex, textareaRef]); // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll selected item into view
  useEffect(() => {
    if (selectedIndex >= 0 && listRef.current) {
      const items = listRef.current.querySelectorAll('[data-emoji-item]');
      items[selectedIndex]?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  const selectEmoji = useCallback((emoji: { id: string; native: string }) => {
    const textarea = textareaRef.current;
    const cursor = textarea?.selectionStart ?? colonStart + query.length + 1;

    onInsertEmoji({
      start: colonStart,
      end: cursor,
      replacement: emoji.native,
    });

    setIsOpen(false);
    setQuery('');
    setColonStart(-1);
  }, [colonStart, query, textareaRef, onInsertEmoji]);

  if (!isOpen || !dropdownPos || results.length === 0) {
    return null;
  }

  return (
    <div
      ref={dropdownRef}
      className="absolute z-[100] w-[280px] rounded-xl border border-border bg-popover shadow-lg overflow-hidden animate-in fade-in-0 zoom-in-95 slide-in-from-top-2 duration-150"
      style={{ top: dropdownPos.top, left: dropdownPos.left }}
    >
      <div ref={listRef} className="max-h-[280px] overflow-y-auto py-1">
        {results.map((emoji, index) => (
          <button
            key={emoji.id}
            data-emoji-item
            className={cn(
              'w-full flex items-center gap-3 px-3 py-1.5 text-left transition-colors cursor-pointer',
              index === selectedIndex ? 'bg-accent text-accent-foreground' : 'hover:bg-secondary/60',
            )}
            onClick={() => selectEmoji(emoji)}
            onMouseDown={(e) => e.preventDefault()}
          >
            <span className="text-xl leading-none shrink-0">{emoji.native}</span>
            <span className="text-sm truncate text-muted-foreground">
              :{emoji.id}:
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
