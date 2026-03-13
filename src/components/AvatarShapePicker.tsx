import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { AVATAR_SHAPES, type AvatarShape, getAvatarShapeLabel } from '@/lib/avatarShape';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface AvatarShapePickerProps {
  /** Currently selected shape. */
  value: AvatarShape;
  /** Called when a shape is selected. */
  onChange: (shape: AvatarShape) => void;
  /** Optional avatar image URL to preview in each shape. */
  pictureUrl?: string;
  /** Fallback initial to show when no picture is available. */
  fallbackInitial?: string;
}

/**
 * Visual picker that shows the user's avatar in each available shape.
 * The selected shape is highlighted with a ring.
 */
export function AvatarShapePicker({
  value,
  onChange,
  pictureUrl,
  fallbackInitial = '?',
}: AvatarShapePickerProps) {
  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex flex-wrap gap-2">
        {AVATAR_SHAPES.map((shape) => {
          const isSelected = shape === value;
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
      </div>
    </TooltipProvider>
  );
}
