import { Link } from 'react-router-dom';
import { FormattedMessage } from 'react-intl';
import { nip19 } from 'nostr-tools';
import type { NostrMetadata } from '@nostrify/nostrify';

import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { getAvatarShape } from '@/lib/avatarShape';
import { FollowButton } from '@/components/FollowButton';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useFollowList } from '@/hooks/useFollowActions';
import { NUKE_THRESHOLD, type FollowUpdate } from '@/hooks/useFollowUpdate';
import { getDisplayName } from '@/lib/getDisplayName';
import { cn } from '@/lib/utils';

type Tone = 'follow' | 'unfollow';

/**
 * The people rows for a kind 3 follow update. The headline sentence
 * ("chad started following") lives in the feed card's actor row; secondary
 * sections here (unfollows beneath follows, nuke counts) carry their own lead-in.
 */
export function FollowUpdateBody({ update, authorName }: { update: FollowUpdate; authorName: string }) {
  const { mode, follows, unfollows, followOverflow, unfollowOverflow, removedCount, latest, peopleMeta } = update;

  if (mode === 'loading') return <RowsSkeleton />;
  if (mode === 'none') return null;

  if (mode === 'latest') {
    return <Rows tone="follow" pubkeys={latest} peopleMeta={peopleMeta} />;
  }

  if (mode === 'nuke') {
    return <NukeCount count={removedCount} />;
  }

  if (mode === 'unfollow') {
    return <Rows tone="unfollow" pubkeys={unfollows} overflow={unfollowOverflow} peopleMeta={peopleMeta} />;
  }

  // mode === 'follow', possibly with unfollows or a nuke beneath.
  const massRemoval = removedCount >= NUKE_THRESHOLD;
  return (
    <div className="space-y-4">
      <Rows tone="follow" pubkeys={follows} overflow={followOverflow} peopleMeta={peopleMeta} />

      {massRemoval && (
        <div>
          <p className="text-sm font-semibold text-rose-600 dark:text-rose-400">
            <FormattedMessage
              id="followDiff.alsoNuked"
              defaultMessage="and nuked the rest of their follow list"
            />
          </p>
          <NukeCount count={removedCount} />
        </div>
      )}

      {!massRemoval && unfollows.length > 0 && (
        <div>
          <p className="text-sm text-muted-foreground">
            <FormattedMessage
              id="followDiff.stoppedFollowing"
              defaultMessage="{author} stopped following"
              values={{ author: authorName }}
            />
          </p>
          <Rows tone="unfollow" pubkeys={unfollows} overflow={unfollowOverflow} peopleMeta={peopleMeta} />
        </div>
      )}

      {!massRemoval && unfollows.length === 0 && unfollowOverflow > 0 && (
        <p className="text-sm text-muted-foreground">
          <FormattedMessage
            id="followDiff.alsoUnfollowed"
            defaultMessage="and stopped following {count, plural, one {# person} other {# people}}"
            values={{ count: unfollowOverflow }}
          />
        </p>
      )}
    </div>
  );
}

// ─── Pieces ───────────────────────────────────────────────────────────

function NukeCount({ count }: { count: number }) {
  return (
    <p className="mt-1 text-sm text-muted-foreground">
      <FormattedMessage
        id="followDiff.nukedCount"
        defaultMessage="{count, plural, one {# person gone} other {# people gone}}"
        values={{ count }}
      />
    </p>
  );
}

function Rows({
  tone,
  pubkeys,
  overflow = 0,
  peopleMeta,
}: {
  tone: Tone;
  pubkeys: string[];
  overflow?: number;
  peopleMeta: Map<string, { metadata?: NostrMetadata }> | undefined;
}) {
  return (
    <div>
      <ul className="mt-3 space-y-3">
        {pubkeys.map((pk) => (
          <PersonRow key={pk} tone={tone} pubkey={pk} metadata={peopleMeta?.get(pk)?.metadata} />
        ))}
      </ul>
      {overflow > 0 && (
        <p className="mt-2 pl-[60px] text-sm text-muted-foreground">
          <FormattedMessage
            id="followDiff.more"
            defaultMessage="and {count} more"
            values={{ count: overflow }}
          />
        </p>
      )}
    </div>
  );
}

function PersonRow({
  tone,
  pubkey,
  metadata,
}: {
  tone: Tone;
  pubkey: string;
  metadata: NostrMetadata | undefined;
}) {
  const { user } = useCurrentUser();
  const { data: followData } = useFollowList();

  const name = getDisplayName(metadata, pubkey);
  const npub = nip19.npubEncode(pubkey);
  const bio = metadata?.about?.trim();
  const isFollow = tone === 'follow';

  // Offer Follow on both sections: someone the author dropped may still be
  // worth following yourself.
  const alreadyFollowing = !!followData?.pubkeys.includes(pubkey);
  const isSelf = user?.pubkey === pubkey;
  const showFollow = !alreadyFollowing && !isSelf;

  return (
    <li className="flex items-center gap-3">
      <Link
        to={`/${npub}`}
        onClick={(e) => e.stopPropagation()}
        aria-label={name}
        className="shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <Avatar shape={getAvatarShape(metadata)} className={cn('size-12', !isFollow && 'grayscale opacity-70')}>
          <AvatarImage src={metadata?.picture} alt={name} />
          <AvatarFallback className="bg-primary/20 text-primary text-base">
            {name[0]?.toUpperCase()}
          </AvatarFallback>
        </Avatar>
      </Link>

      <div className="min-w-0 flex-1">
        <Link
          to={`/${npub}`}
          onClick={(e) => e.stopPropagation()}
          className="block truncate text-[15px] font-semibold leading-snug text-foreground hover:underline"
        >
          {name}
        </Link>
        {bio && (
          <p className="mt-0.5 line-clamp-2 text-sm leading-snug text-muted-foreground">{bio}</p>
        )}
      </div>

      {showFollow && <FollowButton pubkey={pubkey} className="h-8 shrink-0 px-4 text-xs" />}
    </li>
  );
}

function RowsSkeleton() {
  return (
    <div className="mt-3 space-y-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="size-12 shrink-0 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}
