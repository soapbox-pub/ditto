import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Sticker, Info } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CustomEmojiImg } from '@/components/CustomEmoji';
import { useCustomEmojis, type CustomEmoji } from '@/hooks/useCustomEmojis';

interface StickerPickerProps {
  onSelect: (emoji: CustomEmoji) => void;
}

export function StickerPicker({ onSelect }: StickerPickerProps) {
  const { emojis, isLoading } = useCustomEmojis();
  const [infoOpen, setInfoOpen] = useState(false);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1">
        <span className="text-xs font-medium text-muted-foreground px-1">my stickers</span>
        <button
          onClick={() => setInfoOpen(true)}
          className="ml-auto opacity-60 hover:opacity-100 transition-opacity"
          aria-label="About stickers"
        >
          <Info className="w-5 h-5" strokeWidth={2.5} />
        </button>
      </div>

      {isLoading && (
        <div className="grid grid-cols-4 gap-1.5">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square rounded-xl" />
          ))}
        </div>
      )}

      {!isLoading && emojis.length === 0 && (
        <div className="flex flex-col items-center justify-center py-8 text-muted-foreground gap-2">
          <Sticker className="size-8 opacity-40" />
          <p className="text-sm">no sticker packs yet</p>
          <p className="text-xs opacity-70">add emoji packs to your profile to use stickers</p>
        </div>
      )}

      {!isLoading && emojis.length > 0 && (
        <ScrollArea className="h-[200px]">
          <div className="grid grid-cols-4 gap-1.5 p-1">
            {emojis.map((emoji) => (
              <button
                key={emoji.shortcode}
                type="button"
                title={emoji.shortcode}
                onClick={() => onSelect(emoji)}
                className="aspect-square rounded-xl overflow-hidden hover:bg-muted/80 transition-all p-1.5 group active:scale-90"
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
              Stickers
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>
              Stickers are custom emoji packs (NIP-30) published on Nostr. They get placed on top of your letter as decorations.
            </p>
            <p>
              Add emoji packs to your profile to make them available as stickers.
            </p>
            <p>
              <Link
                to="/emojis"
                onClick={() => setInfoOpen(false)}
                className="text-foreground font-medium underline underline-offset-2 hover:no-underline"
              >
                Browse emoji packs
              </Link>
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
