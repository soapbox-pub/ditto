import type { NostrEvent } from '@nostrify/nostrify';
import { Award, Check, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useAcceptBadge } from '@/hooks/useAcceptBadge';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useProfileBadges } from '@/hooks/useProfileBadges';
import { BADGE_DEFINITION_KIND } from '@/lib/badgeUtils';
import { cn } from '@/lib/utils';

export interface AcceptBadgeButtonProps {
  /** The kind 8 badge award event. */
  awardEvent: NostrEvent;
  /** Prominent pill style (large, rounded-full, colored). Otherwise compact outline variant. */
  prominent?: boolean;
}

/**
 * Button that lets the logged-in recipient accept a NIP-58 badge award by
 * adding it to their profile badges event. Shows a muted "Accepted" label
 * once the badge is already in the user's collection. Renders `null` if the
 * user is not logged in or the award is malformed.
 */
export function AcceptBadgeButton({ awardEvent, prominent }: AcceptBadgeButtonProps) {
  const { user } = useCurrentUser();
  const { refs } = useProfileBadges(user?.pubkey);
  const { mutate: acceptBadge, isPending, isSuccess } = useAcceptBadge();

  const aTag = awardEvent.tags.find(
    ([n, v]) => n === 'a' && v?.startsWith(`${BADGE_DEFINITION_KIND}:`),
  )?.[1];

  // Already accepted if the user's profile badges event references this a-tag,
  // or if the mutation just succeeded (before the cache refetches).
  const alreadyAccepted = refs.some((r) => r.aTag === aTag) || isSuccess;

  if (!aTag || !user) return null;

  if (alreadyAccepted) {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 text-muted-foreground',
          prominent ? 'text-sm' : 'text-xs',
        )}
      >
        <Check className={prominent ? 'size-4' : 'size-3'} />
        Accepted
      </span>
    );
  }

  if (prominent) {
    return (
      <Button
        className="rounded-full px-6 h-10 text-sm font-semibold gap-2 shadow-md hover:scale-105 active:scale-95 transition-all"
        onClick={(e) => {
          e.stopPropagation();
          acceptBadge({ aTag, awardEventId: awardEvent.id });
        }}
        disabled={isPending}
        style={{ filter: 'drop-shadow(0 2px 8px hsl(var(--primary) / 0.25))' }}
      >
        {isPending ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <>
            <Award className="size-4" />
            Accept Badge
          </>
        )}
      </Button>
    );
  }

  return (
    <Button
      size="sm"
      variant="outline"
      className="h-7 px-2.5 text-xs font-medium gap-1 transition-colors hover:bg-primary hover:text-primary-foreground"
      onClick={(e) => {
        e.stopPropagation();
        acceptBadge({ aTag, awardEventId: awardEvent.id });
      }}
      disabled={isPending}
    >
      {isPending ? (
        <Loader2 className="size-3 animate-spin" />
      ) : (
        <>
          <Award className="size-3" />
          Accept
        </>
      )}
    </Button>
  );
}
