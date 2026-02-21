import { useState } from 'react';
import { VolumeX, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useMuteList } from '@/hooks/useMuteList';
import { isEventMuted } from '@/lib/muteHelpers';
import { cn } from '@/lib/utils';
import type { NostrEvent } from '@nostrify/nostrify';

interface MutedContentGuardProps {
  /** The Nostr event to check against the mute list. */
  event: NostrEvent;
  /** Content that should only render when the user dismisses the guard. */
  children: React.ReactNode;
  /** Optional class name for the guard container. */
  className?: string;
}

/**
 * Guards children behind a muted-content overlay when the event matches
 * the user's mute list. Used on detail pages where the user navigated
 * directly to a muted post — feeds hide muted content entirely instead.
 *
 * Children are **not mounted** until the user explicitly reveals, so
 * media and nested queries are not fetched for muted content.
 */
export function MutedContentGuard({ event, children, className }: MutedContentGuardProps) {
  const { muteItems } = useMuteList();
  const [revealed, setRevealed] = useState(false);

  if (revealed || muteItems.length === 0 || !isEventMuted(event, muteItems)) {
    return <>{children}</>;
  }

  return (
    <div className={cn('px-4 py-12', className)}>
      <div className="max-w-sm mx-auto flex flex-col items-center text-center gap-3">
        <div className="flex items-center justify-center size-10 rounded-full bg-muted">
          <VolumeX className="size-5 text-muted-foreground" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">Muted Content</p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            This post is from a user or conversation you've muted.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 mt-1 rounded-full px-5"
          onClick={() => setRevealed(true)}
        >
          <Eye className="size-3.5" />
          Show Anyway
        </Button>
      </div>
    </div>
  );
}
