import { Flame } from 'lucide-react';
import { nip19 } from 'nostr-tools';
import { useEffect, useState } from 'react';
import { FormattedMessage } from 'react-intl';
import { Link } from 'react-router-dom';

import { EmojifiedText } from '@/components/CustomEmoji';
import { FallbackImage } from '@/components/FallbackImage';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { useCurrentUser, useCurrentUserProfile } from '@/hooks/useCurrentUser';
import { useNip85UserStats } from '@/hooks/useNip85Stats';
import { useProfileSupplementary } from '@/hooks/useProfileData';
import { useProfileUrl } from '@/hooks/useProfileUrl';
import { useStreak } from '@/hooks/useStreak';
import { getAvatarShape } from '@/lib/avatarShape';
import { formatNumber } from '@/lib/formatNumber';
import { getDisplayName } from '@/lib/getDisplayName';
import { streakDays, subscribeStreakStarted } from '@/lib/streak';

/**
 * "You unlocked a streak!" — shown when a creative post starts a new posting
 * streak (see useStreakSync). Mirrors Soapbox's streak modal: a mini profile
 * card of the user's own account with their followers, following, and streak.
 */
export function StreakStartedDialog() {
  const { user } = useCurrentUser();
  const [open, setOpen] = useState(false);

  const pubkey = user?.pubkey;
  useEffect(() => {
    if (!pubkey) return;
    return subscribeStreakStarted((started) => {
      if (started === pubkey) setOpen(true);
    });
  }, [pubkey]);

  // Close if the account changes underneath an open dialog.
  useEffect(() => setOpen(false), [pubkey]);

  if (!pubkey) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-sm">
        {open && <StreakStartedBody pubkey={pubkey} onClose={() => setOpen(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function StreakStartedBody({ pubkey, onClose }: { pubkey: string; onClose: () => void }) {
  const { metadata, event } = useCurrentUserProfile();
  const { data: supplementary } = useProfileSupplementary(pubkey);
  const { data: userStats } = useNip85UserStats(pubkey);
  const { data: streak } = useStreak(pubkey, { enabled: false });
  const profileUrl = useProfileUrl(pubkey, metadata);

  const displayName = getDisplayName(metadata, pubkey);
  const followersCount = userStats?.followers ?? 0;
  const followingCount = supplementary?.following.length ?? 0;
  // The streak that triggered this dialog is live, so it's at least one day.
  const days = Math.max(1, streakDays(streak ?? undefined));

  return (
    <>
      <DialogTitle className="flex items-center justify-center gap-1.5 pt-4 text-xl font-bold">
        <FormattedMessage id="streak.started.title" defaultMessage="You unlocked a" />
        <Flame className="size-6 fill-orange-500 text-orange-500" aria-hidden />
        <FormattedMessage id="streak.started.titleEnd" defaultMessage="streak!" />
      </DialogTitle>

      <div className="mx-auto w-80 max-w-full overflow-hidden rounded-xl border bg-card">
        <div className="h-14 bg-secondary">
          <FallbackImage src={metadata?.banner} className="size-full object-cover" loading="lazy" decoding="async" />
        </div>

        <div className="-mt-10 flex flex-col gap-2 px-3 pb-3">
          <div className="flex items-end justify-between">
            <Link to={profileUrl} onClick={onClose} className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <Avatar shape={getAvatarShape(metadata)} className="size-20 border-3 border-card">
                <AvatarImage src={metadata?.picture} alt={displayName} />
                <AvatarFallback className="bg-primary/20 text-2xl text-primary">
                  {displayName[0]?.toUpperCase()}
                </AvatarFallback>
              </Avatar>
            </Link>
            <Button asChild variant="outline" size="sm" className="rounded-full font-bold">
              <Link to="/settings/profile" onClick={onClose}>
                <FormattedMessage id="streak.started.editProfile" defaultMessage="Edit profile" />
              </Link>
            </Button>
          </div>

          <Link to={profileUrl} onClick={onClose} className="truncate text-lg font-bold hover:underline">
            {event ? <EmojifiedText tags={event.tags}>{displayName}</EmojifiedText> : displayName}
          </Link>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <span className="flex items-center gap-1">
              <span className="font-bold tabular-nums text-primary">{formatNumber(followersCount)}</span>
              <span className="text-muted-foreground">
                <FormattedMessage
                  id="streak.started.followers"
                  defaultMessage="{count, plural, one {follower} other {followers}}"
                  values={{ count: followersCount }}
                />
              </span>
            </span>
            <Link
              to={`/${nip19.naddrEncode({ kind: 3, pubkey, identifier: '' })}`}
              onClick={onClose}
              className="flex items-center gap-1 hover:opacity-80"
            >
              <span className="font-bold tabular-nums text-primary">{formatNumber(followingCount)}</span>
              <span className="text-muted-foreground">
                <FormattedMessage id="streak.started.following" defaultMessage="following" />
              </span>
            </Link>
            <span className="flex items-center gap-1">
              <Flame className="size-4 fill-orange-500 text-orange-500" aria-hidden />
              <span className="font-bold tabular-nums">{formatNumber(days)}</span>
              <span className="sr-only">
                <FormattedMessage
                  id="streak.badge.unit"
                  defaultMessage="{count, plural, one {day streak} other {day streak}}"
                  values={{ count: days }}
                />
              </span>
            </span>
          </div>
        </div>
      </div>

      <DialogDescription className="pb-2 text-center text-base text-foreground">
        <FormattedMessage id="streak.started.message" defaultMessage="Post every day to keep it going." />
      </DialogDescription>
    </>
  );
}
