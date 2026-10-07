import { useState } from 'react';
import { useIntl } from 'react-intl';

import { CustomEmojiImg } from '@/components/CustomEmoji';
import { EmojiSourceFooter } from '@/components/EmojiSourceFooter';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface EmojiSourcePopoverProps {
  /** The shortcode name (without colons). */
  name: string;
  /** The image URL. */
  url: string;
  /** CSS class name forwarded to the inline emoji image. */
  imgClassName?: string;
  /** Who wrote the note, for the author-scoped pack lookup on an unknown emoji. */
  authorPubkey?: string;
}

/**
 * An inline custom emoji that opens, on tap, which NIP-30 pack it came from
 * with a one-tap add — seeing an emoji you like in a post is enough to get
 * its pack, without hunting for a reaction to inspect.
 *
 * The popover body is `EmojiSourceFooter`, which Radix mounts only while the
 * popover is open — so a feed full of custom emoji costs no pack lookups.
 */
export function EmojiSourcePopover({ name, url, imgClassName, authorPubkey }: EmojiSourcePopoverProps) {
  const intl = useIntl();
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {/* A bare inline button so the emoji keeps its place in the text flow;
            stopPropagation keeps the tap from also opening the note. */}
        <button
          type="button"
          aria-label={intl.formatMessage(
            { id: 'emojiSource.inlineLabel', defaultMessage: ':{name}: emoji — show its pack' },
            { name },
          )}
          className="inline cursor-pointer rounded-sm align-text-bottom focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={(e) => e.stopPropagation()}
        >
          <CustomEmojiImg name={name} url={url} className={imgClassName} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        sideOffset={8}
        className="w-64 p-0 rounded-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 px-4 pt-3 pb-1">
          <CustomEmojiImg name={name} url={url} className="size-10 shrink-0 object-contain" />
          <span className="truncate text-sm font-medium">:{name}:</span>
        </div>
        <EmojiSourceFooter url={url} authorPubkey={authorPubkey} />
      </PopoverContent>
    </Popover>
  );
}
