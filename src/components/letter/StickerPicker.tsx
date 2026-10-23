import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Sticker, Info } from 'lucide-react';
import { FormattedMessage, useIntl } from 'react-intl';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CustomEmojiImg } from '@/components/CustomEmoji';
import { EmojiPicker } from '@/components/EmojiPicker';
import { useCustomEmojis, type CustomEmoji } from '@/hooks/useCustomEmojis';
import { useDragOut } from '@/hooks/useDragOut';
import { cn } from '@/lib/utils';

interface StickerPickerProps {
  onSelect: (emoji: CustomEmoji) => void;
  /** A native emoji picked as a sticker. */
  onSelectEmoji: (emoji: string) => void;
  /** A sticker dragged out of the picker and released at (x, y) in the viewport. */
  onDrop?: (emoji: CustomEmoji, x: number, y: number) => void;
}

type Tab = 'stickers' | 'emoji';

const tabClass = (active: boolean) => cn(
  'inline-flex items-center h-7 px-3 rounded-full text-xs font-medium transition-all',
  active ? 'bg-foreground text-background' : 'bg-secondary text-muted-foreground hover:text-foreground',
);

export function StickerPicker({ onSelect, onSelectEmoji, onDrop }: StickerPickerProps) {
  const intl = useIntl();
  const { emojis, isLoading } = useCustomEmojis();
  const [infoOpen, setInfoOpen] = useState(false);
  const [tab, setTab] = useState<Tab>(() => (!isLoading && emojis.length === 0 ? 'emoji' : 'stickers'));
  const drag = useDragOut(onDrop);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1">
        <button type="button" onClick={() => setTab('stickers')} className={tabClass(tab === 'stickers')} aria-pressed={tab === 'stickers'}>
          <FormattedMessage id="stickerPicker.myStickers" defaultMessage="my stickers" />
        </button>
        <button type="button" onClick={() => setTab('emoji')} className={tabClass(tab === 'emoji')} aria-pressed={tab === 'emoji'}>
          <FormattedMessage id="stickerPicker.emoji" defaultMessage="emoji" />
        </button>
        <button
          onClick={() => setInfoOpen(true)}
          className="ml-auto opacity-60 hover:opacity-100 transition-opacity"
          aria-label={intl.formatMessage({ id: 'stickerPicker.about', defaultMessage: 'About stickers' })}
        >
          <Info className="w-5 h-5" strokeWidth={2.5} />
        </button>
      </div>

      {tab === 'emoji' && (
        <EmojiPicker
          height={260}
          onSelect={(selection) => {
            if (selection.type === 'native') onSelectEmoji(selection.emoji);
          }}
        />
      )}

      {tab === 'stickers' && isLoading && (
        <div className="grid grid-cols-4 gap-1.5">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square rounded-xl" />
          ))}
        </div>
      )}

      {tab === 'stickers' && !isLoading && emojis.length === 0 && (
        <div className="flex flex-col items-center justify-center py-8 text-muted-foreground gap-2">
          <Sticker className="size-8 opacity-40" />
          <p className="text-sm">
            <FormattedMessage id="stickerPicker.empty" defaultMessage="no sticker packs yet" />
          </p>
          <p className="text-xs opacity-70">
            <FormattedMessage id="stickerPicker.emptyHint" defaultMessage="add emoji packs to your profile to use stickers" />
          </p>
        </div>
      )}

      {tab === 'stickers' && !isLoading && emojis.length > 0 && (
        <ScrollArea className="h-[200px]">
          <div className="grid grid-cols-4 gap-1.5 p-1">
            {emojis.map((emoji) => (
              <button
                key={emoji.shortcode}
                type="button"
                title={emoji.shortcode}
                onPointerDown={(e) => drag.start(e, emoji, { url: emoji.url })}
                onClick={() => { if (!drag.justDropped()) onSelect(emoji); }}
                className="aspect-square rounded-xl overflow-hidden hover:bg-muted/80 transition-all p-1.5 group active:scale-90 touch-manipulation select-none [-webkit-touch-callout:none]"
              >
                <CustomEmojiImg
                  name={emoji.shortcode}
                  url={emoji.url}
                  className="w-full h-full object-contain group-hover:scale-110 transition-transform duration-150"
                />
              </button>
            ))}
          </div>
        </ScrollArea>
      )}

      <Dialog open={infoOpen} onOpenChange={setInfoOpen}>
        <DialogContent className="max-w-xs rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sticker className="w-5 h-5 shrink-0" />
              <FormattedMessage id="stickerPicker.title" defaultMessage="Stickers" />
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>
              <FormattedMessage
                id="stickerPicker.info"
                defaultMessage="Stickers are custom emoji packs (NIP-30) published on Nostr. They get placed on top of your letter as decorations."
              />
            </p>
            <p>
              <FormattedMessage
                id="stickerPicker.infoHint"
                defaultMessage="Add emoji packs to your profile to make them available as stickers."
              />
            </p>
            <p>
              <Link
                to="/emojis"
                onClick={() => setInfoOpen(false)}
                className="text-foreground font-medium underline underline-offset-2 hover:no-underline"
              >
                <FormattedMessage id="stickerPicker.browse" defaultMessage="Browse emoji packs" />
              </Link>
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
