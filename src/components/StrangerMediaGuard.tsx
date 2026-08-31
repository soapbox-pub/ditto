import { useMemo, useState } from 'react';
import { ImageOff, Eye } from 'lucide-react';
import { FormattedMessage } from 'react-intl';
import type { NostrEvent } from '@nostrify/nostrify';
import { Button } from '@/components/ui/button';
import { useAppContext } from '@/hooks/useAppContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useFollowList } from '@/hooks/useFollowActions';
import { eventHasMedia } from '@/lib/mediaUtils';
import { cn } from '@/lib/utils';

interface StrangerMediaGuardProps {
  /** The Nostr event whose author is checked against the follow list. */
  event: NostrEvent;
  /** Content that should only render when the overlay is dismissed. */
  children: React.ReactNode;
  /** Optional class name for the overlay container. */
  className?: string;
}

/**
 * Guards children behind a click-to-reveal overlay when the
 * `hideMediaFromStrangers` setting is on and the event's author is not in the
 * logged-in user's follow list.
 *
 * Children are **not mounted** until the user explicitly reveals, so media is
 * never fetched for a stranger's post until the viewer opts in. The guard is a
 * no-op when:
 * - the setting is off,
 * - the viewer is logged out (nothing to compare a follow list against),
 * - the author is the viewer or someone they follow, or
 * - the post carries no media.
 */
export function StrangerMediaGuard({ event, children, className }: StrangerMediaGuardProps) {
  const { config } = useAppContext();
  const { user } = useCurrentUser();
  const { data: followData } = useFollowList();
  const [revealed, setRevealed] = useState(false);

  const followedPubkeys = useMemo(
    () => new Set(followData?.pubkeys ?? []),
    [followData],
  );

  // Setting off, logged out, already revealed, or the post has no media —
  // render normally. (The follow list is unavailable when logged out, so
  // gating then would blur the entire feed for anonymous visitors.)
  if (
    !config.hideMediaFromStrangers ||
    !user ||
    revealed ||
    !eventHasMedia(event)
  ) {
    return <>{children}</>;
  }

  // The author is the viewer or someone they follow — no gate.
  if (event.pubkey === user.pubkey || followedPubkeys.has(event.pubkey)) {
    return <>{children}</>;
  }

  return (
    <div className={cn('relative mt-2 rounded-xl overflow-hidden', className)}>
      {/* Blurred filler — contained within the rounded box */}
      <div className="bg-muted/40 blur-lg select-none" aria-hidden>
        <div className="px-4 pt-4 pb-2 space-y-2.5">
          <div className="h-3.5 w-4/5 rounded bg-muted/60" />
          <div className="h-3.5 w-3/5 rounded bg-muted/60" />
        </div>
        <div className="mx-4 mb-4 mt-1 h-32 rounded-lg bg-muted/60" />
      </div>

      {/* Centered overlay — positioned over the filler */}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 px-4 text-center">
        <div className="flex items-center justify-center size-10 rounded-full bg-background/80 shadow-sm backdrop-blur-sm">
          <ImageOff className="size-5 text-muted-foreground" />
        </div>
        <div className="space-y-1 max-w-xs">
          <p className="text-sm font-medium text-foreground">
            <FormattedMessage id="strangerMedia.title" defaultMessage="Media hidden" />
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            <FormattedMessage
              id="strangerMedia.description"
              defaultMessage="This post is from someone you don't follow."
            />
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 mt-0.5 rounded-full px-5 bg-background/80 backdrop-blur-sm"
          onClick={(e) => {
            e.stopPropagation();
            setRevealed(true);
          }}
        >
          <Eye className="size-3.5" />
          <FormattedMessage id="strangerMedia.reveal" defaultMessage="Show" />
        </Button>
      </div>
    </div>
  );
}
