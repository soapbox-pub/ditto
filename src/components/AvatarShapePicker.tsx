import { useState } from 'react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { AVATAR_SHAPES, type AvatarShape, type PredefinedAvatarShape, getAvatarShapeLabel, isEmoji } from '@/lib/avatarShape';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { EmojiPicker, type EmojiSelection } from '@/components/EmojiPicker';
import { SmilePlus, X } from 'lucide-react';

interface AvatarShapePickerProps {
  /** Currently selected shape (predefined name or emoji string). */
  value: AvatarShape;
  /** Called when a shape is selected. */
  onChange: (shape: AvatarShape) => void;
  /** Optional avatar image URL to preview in each shape. */
  pictureUrl?: string;
  /** Fallback initial to show when no picture is available. */
  fallbackInitial?: string;
}

/**
 * Visual picker that shows the user's avatar in each available shape,
 * plus an emoji picker button for choosing any emoji as a mask.
 * The selected shape is highlighted with a ring.
 */
export function AvatarShapePicker({
  value,
  onChange,
  pictureUrl,
  fallbackInitial = '?',
}: AvatarShapePickerProps) {
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);

  const isEmojiSelected = isEmoji(value);

  const handleEmojiSelect = (selection: EmojiSelection) => {
    if (selection.type === 'native') {
      onChange(selection.emoji);
      setEmojiPickerOpen(false);
    }
    // Custom emojis (NIP-30 image URLs) are not supported as mask shapes
  };

  const handleClearEmoji = () => {
    onChange('circle');
  };

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex flex-wrap items-center gap-2">
        {/* Predefined geometric shapes */}
        {AVATAR_SHAPES.map((shape: PredefinedAvatarShape) => {
          const isSelected = value === shape;
          return (
            <Tooltip key={shape}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => onChange(shape)}
                  className={cn(
                    'rounded-lg p-1.5 transition-all duration-150 outline-none',
                    'hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                    isSelected && 'bg-accent ring-2 ring-primary ring-offset-2 ring-offset-background',
                  )}
                >
                  <Avatar shape={shape} className="size-9">
                    <AvatarImage src={pictureUrl} alt={getAvatarShapeLabel(shape)} />
                    <AvatarFallback className="bg-primary/20 text-primary text-xs">
                      {fallbackInitial}
                    </AvatarFallback>
                  </Avatar>
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                {getAvatarShapeLabel(shape)}
              </TooltipContent>
            </Tooltip>
          );
        })}

        {/* Emoji shape — show selected emoji or picker trigger */}
        <Popover open={emojiPickerOpen} onOpenChange={setEmojiPickerOpen}>
          <Tooltip>
            <TooltipTrigger asChild>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    'rounded-lg p-1.5 transition-all duration-150 outline-none',
                    'hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                    isEmojiSelected && 'bg-accent ring-2 ring-primary ring-offset-2 ring-offset-background',
                  )}
                >
                  {isEmojiSelected ? (
                    <Avatar shape={value} className="size-9">
                      <AvatarImage src={pictureUrl} alt={`Emoji: ${value}`} />
                      <AvatarFallback className="bg-primary/20 text-primary text-xs">
                        {fallbackInitial}
                      </AvatarFallback>
                    </Avatar>
                  ) : (
                    <div className="size-9 rounded-lg border-2 border-dashed border-muted-foreground/30 flex items-center justify-center bg-muted/30 hover:border-muted-foreground/50 transition-colors">
                      <SmilePlus className="size-4 text-muted-foreground" />
                    </div>
                  )}
                </button>
              </PopoverTrigger>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              {isEmojiSelected ? `Emoji: ${value}` : 'Emoji shape'}
            </TooltipContent>
          </Tooltip>
          <PopoverContent
            side="bottom"
            align="start"
            className="w-auto p-0 border-0 bg-transparent shadow-none"
            sideOffset={8}
          >
            <div className="relative">
              <EmojiPicker onSelect={handleEmojiSelect} />
              {isEmojiSelected && (
                <button
                  type="button"
                  onClick={handleClearEmoji}
                  className="absolute top-2 right-2 z-10 rounded-full bg-background border border-border p-1 shadow-sm hover:bg-destructive hover:text-destructive-foreground transition-colors"
                  title="Clear emoji shape"
                >
                  <X className="size-3" />
                </button>
              )}
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </TooltipProvider>
  );
}
