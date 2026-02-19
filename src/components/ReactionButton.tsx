import { useState } from 'react';
import { Heart } from 'lucide-react';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { QuickReactMenu } from '@/components/QuickReactMenu';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { cn } from '@/lib/utils';

interface ReactionButtonProps {
  /** The event ID being reacted to. */
  eventId: string;
  /** The pubkey of the event author. */
  eventPubkey: string;
  /** The kind number of the event being reacted to. */
  eventKind: number;
  /** Current reaction count from stats. */
  reactionCount?: number;
  /** Optional extra class names. */
  className?: string;
}

export function ReactionButton({
  eventId,
  eventPubkey,
  eventKind,
  reactionCount = 0,
  className,
}: ReactionButtonProps) {
  const { user } = useCurrentUser();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <Popover open={menuOpen} onOpenChange={setMenuOpen}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            'flex items-center gap-1.5 p-2 rounded-full transition-colors',
            'text-muted-foreground hover:text-pink-500 hover:bg-pink-500/10',
            className,
          )}
          title="React"
          onClick={(e) => {
            e.stopPropagation();
            if (!user) return;
            setMenuOpen((prev) => !prev);
          }}
          onMouseEnter={() => {
            if (user) setMenuOpen(true);
          }}
          onMouseLeave={() => {
            // Don't close on mouse leave - let user move to the menu
          }}
        >
          <Heart className="size-5" />
          {reactionCount > 0 && (
            <span className="text-sm tabular-nums">{reactionCount}</span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-auto p-0 border-0 bg-transparent shadow-none"
        side="top"
        align="start"
        onClick={(e) => e.stopPropagation()}
        onOpenAutoFocus={(e) => e.preventDefault()}
        onMouseEnter={() => setMenuOpen(true)}
        onMouseLeave={() => setMenuOpen(false)}
      >
        <QuickReactMenu
          eventId={eventId}
          eventPubkey={eventPubkey}
          eventKind={eventKind}
        />
      </PopoverContent>
    </Popover>
  );
}
