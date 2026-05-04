import { useState, useEffect, useCallback, useRef } from 'react';
import { nip19 } from 'nostr-tools';
import { UserRoundCheck } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { getAvatarShape } from '@/lib/avatarShape';
import { EmojifiedText } from '@/components/CustomEmoji';
import { useSearchProfiles, type SearchProfile } from '@/hooks/useSearchProfiles';
import { genUserName } from '@/lib/genUserName';
import { useNip05Verify } from '@/hooks/useNip05Verify';
import { cn } from '@/lib/utils';
import { usePortalDropdown } from '@/hooks/usePortalDropdown';

interface MentionAutocompleteProps {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  content: string;
  onInsertMention: (params: { start: number; end: number; replacement: string }) => void;
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
  mirror.id = 'mention-mirror';

  const style = window.getComputedStyle(textarea);

  // Copy all layout-affecting styles
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

  // Set the text up to the caret position
  mirror.textContent = textarea.value.substring(0, position);

  // Add a span at the caret position to measure
  const marker = document.createElement('span');
  marker.textContent = '\u200b'; // zero-width space
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

/**
 * Detects `@query` at the cursor position in a textarea and shows
 * a profile autocomplete dropdown. On selection, replaces `@query`
 * with `nostr:npub1...` in the content.
 */
export function MentionAutocomplete({
  textareaRef,
  content,
  onInsertMention,
}: MentionAutocompleteProps) {
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionStart, setMentionStart] = useState(-1);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number } | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const handleClose = useCallback(() => setIsOpen(false), []);
  const { computePosition, renderPortal } = usePortalDropdown({
    textareaRef,
    isOpen,
    onClose: handleClose,
    dropdownHeight: 240, // must match max-h-[240px] below
  });

  const { data: profiles, followedPubkeys } = useSearchProfiles(
    isOpen ? mentionQuery : '',
  );

  // Detect @mention query at cursor.
  // Accepts explicit text/cursor values so callers don't have to rely on
  // the DOM textarea state (which can be stale in React effects).
  const detectMention = useCallback((text?: string, cursorPos?: number) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const cursor = cursorPos ?? textarea.selectionStart;
    const value = text ?? textarea.value;

    // Walk back from cursor to find an unescaped @ that starts a mention
    let atPos = -1;
    for (let i = cursor - 1; i >= 0; i--) {
      const ch = value[i];
      // Stop at whitespace or newline — no match
      if (ch === ' ' || ch === '\n' || ch === '\t') break;
      if (ch === '@') {
        // Must be at start of text or preceded by whitespace
        if (i === 0 || /\s/.test(value[i - 1])) {
          atPos = i;
        }
        break;
      }
    }

    if (atPos === -1) {
      setIsOpen(false);
      setMentionQuery('');
      setMentionStart(-1);
      return;
    }

    const query = value.slice(atPos + 1, cursor);

    // Don't show for empty query or very long queries
    if (query.length === 0 || query.length > 50) {
      setIsOpen(false);
      setMentionQuery('');
      setMentionStart(-1);
      return;
    }

    setMentionQuery(query);
    setMentionStart(atPos);
    setIsOpen(true);
    setSelectedIndex(0);

    // Position the dropdown using fixed viewport coordinates so it isn't
    // clipped by ancestor overflow containers (e.g. the compose modal).
    const coords = getCaretCoordinates(textarea, atPos);
    setDropdownPos(computePosition(coords));
  }, [textareaRef, computePosition]);

  // Listen for input/cursor changes on the textarea element.
  // Re-attaches whenever the underlying DOM element changes (e.g. after
  // preview mode toggles remount the textarea).
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const handleInput = () => {
      // Read directly from the DOM — the browser has already updated
      // value and selectionStart before firing the input event.
      detectMention(textarea.value, textarea.selectionStart);
    };
    const handleClick = () => detectMention();
    const handleKeyUp = (e: KeyboardEvent) => {
      if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
        detectMention();
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
  // content in deps so we re-attach if textarea element is remounted
  // (e.g. preview mode toggle destroys and recreates the textarea)
  }, [textareaRef, detectMention, content]);

  // Re-detect when content changes (covers external mutations like emoji
  // insertion that don't fire native input events). Pass the content prop
  // directly so we don't depend on the DOM textarea value being in sync.
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    detectMention(content, textarea.selectionStart);
  }, [content, detectMention, textareaRef]);

  // Handle keyboard navigation within the dropdown
  useEffect(() => {
    if (!isOpen || !profiles || profiles.length === 0) return;

    const textarea = textareaRef.current;
    if (!textarea) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((prev) => (prev < (profiles?.length ?? 1) - 1 ? prev + 1 : 0));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((prev) => (prev > 0 ? prev - 1 : (profiles?.length ?? 1) - 1));
          break;
        case 'Enter':
        case 'Tab':
          if (profiles && profiles.length > 0) {
            e.preventDefault();
            selectProfile(profiles[selectedIndex]);
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
  }, [isOpen, profiles, selectedIndex, textareaRef]); // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll selected item into view
  useEffect(() => {
    if (selectedIndex >= 0 && listRef.current) {
      const items = listRef.current.querySelectorAll('[data-mention-item]');
      items[selectedIndex]?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  const selectProfile = useCallback((profile: SearchProfile) => {
    const npub = nip19.npubEncode(profile.pubkey);
    const replacement = `nostr:${npub} `;
    const cursor = textareaRef.current?.selectionStart ?? mentionStart + mentionQuery.length + 1;

    onInsertMention({
      start: mentionStart,
      end: cursor,
      replacement,
    });

    setIsOpen(false);
    setMentionQuery('');
    setMentionStart(-1);
  }, [mentionStart, mentionQuery, textareaRef, onInsertMention]);

  if (!isOpen || !dropdownPos || !profiles || profiles.length === 0) {
    return null;
  }

  const dropdown = (
    <div
      ref={dropdownRef}
      data-autocomplete-dropdown
      className="fixed z-[300] w-[280px] rounded-xl border border-border bg-popover shadow-lg overflow-hidden animate-in fade-in-0 zoom-in-95 slide-in-from-top-2 duration-150 pointer-events-auto"
      style={{ top: dropdownPos.top, left: dropdownPos.left }}
    >
      <div ref={listRef} className="max-h-[240px] overflow-y-auto py-1">
        {profiles.map((profile, index) => (
          <MentionItem
            key={profile.pubkey}
            profile={profile}
            isSelected={index === selectedIndex}
            isFollowed={followedPubkeys.has(profile.pubkey)}
            onClick={() => selectProfile(profile)}
          />
        ))}
      </div>
    </div>
  );

  // Portal to document.body so the dropdown escapes any ancestor overflow
  // clipping and CSS transform containing blocks (e.g. Radix Dialog).
  return renderPortal(dropdown, document.body);
}

function MentionItem({
  profile,
  isSelected,
  isFollowed,
  onClick,
}: {
  profile: SearchProfile;
  isSelected: boolean;
  isFollowed: boolean;
  onClick: () => void;
}) {
  const { metadata, pubkey } = profile;
  const displayName = metadata.name || metadata.display_name || genUserName(pubkey);
  const nip05 = metadata.nip05;
  const { data: nip05Verified } = useNip05Verify(nip05, pubkey);
  const nip05Display = nip05Verified && nip05 ? (nip05.startsWith('_@') ? nip05.slice(2) : nip05) : undefined;
  const identifier = nip05Display || nip19.npubEncode(pubkey);

  return (
    <button
      data-mention-item
      className={cn(
        'w-full flex items-center gap-3 px-3 py-2 text-left transition-colors cursor-pointer',
        isSelected ? 'bg-accent text-accent-foreground' : 'hover:bg-secondary/60',
      )}
      onClick={onClick}
      onMouseDown={(e) => e.preventDefault()}
    >
      <div className="relative shrink-0">
        <Avatar shape={getAvatarShape(metadata)} className="size-8">
          <AvatarImage src={metadata.picture} alt={displayName} />
          <AvatarFallback className="bg-primary/20 text-primary text-xs">
            {displayName[0]?.toUpperCase() || '?'}
          </AvatarFallback>
        </Avatar>
        {isFollowed && (
          <span
            className="absolute -bottom-0.5 -right-0.5 size-3.5 rounded-full bg-primary flex items-center justify-center ring-2 ring-popover"
            title="Following"
          >
            <UserRoundCheck className="size-2 text-primary-foreground" strokeWidth={3} />
          </span>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="font-semibold text-sm truncate">
            <EmojifiedText tags={profile.event.tags}>{displayName}</EmojifiedText>
          </span>
        </div>
        <div className="text-xs text-muted-foreground truncate">
          {nip05Display ? (
            <span className="truncate">{identifier}</span>
          ) : (
            <span className="truncate font-mono text-[11px]">{identifier}</span>
          )}
        </div>
      </div>
    </button>
  );
}
