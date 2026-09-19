import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { UserMinus } from 'lucide-react';
import { FormattedMessage } from 'react-intl';
import { nip19 } from 'nostr-tools';
import type { NostrEvent } from '@nostrify/nostrify';

import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { getAvatarShape } from '@/lib/avatarShape';
import { FollowButton } from '@/components/FollowButton';
import { useAuthor } from '@/hooks/useAuthor';
import { useAuthors } from '@/hooks/useAuthors';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useFollowList } from '@/hooks/useFollowActions';
import { usePeopleListDiff } from '@/hooks/usePeopleListDiff';
import { getDisplayName } from '@/lib/getDisplayName';
import { getPeopleListVariant } from '@/lib/packUtils';

/** Most timeline rows to render before collapsing the rest into "+N more". */
const MAX_ACTIONS = 3;
/** A removal this large is treated as a wipe rather than listed person-by-person. */
const NUKE_THRESHOLD = 10;

type ActionKind = 'followed' | 'unfollowed';
interface Action {
  kind: ActionKind;
  pubkey: string;
}

/**
 * Renders what changed between this people-list version and the previous one as
 * a compact activity timeline — "{author} followed {person}" rows, each with a
 * Follow button when you don't already follow that person. Caps the list at
 * {@link MAX_ACTIONS} rows and collapses a mass unfollow into a single "nuked
 * their follow list" notice.
 *
 * Renders nothing when there's no previous version to compare against (e.g. the
 * relay doesn't retain history) or nothing changed.
 */
export function FollowListDiff({ event }: { event: NostrEvent }) {
  const { data: diff } = usePeopleListDiff(event);
  const author = useAuthor(event.pubkey);
  const authorName = getDisplayName(author.data?.metadata, event.pubkey);
  const variant = getPeopleListVariant(event.kind);
  const isFollowList = variant === 'follow-list';

  const massRemoval = (diff?.removed.length ?? 0) >= NUKE_THRESHOLD;

  // Newest follows are appended last on kind 3, so reverse to surface them first.
  const actions = useMemo<Action[]>(() => {
    if (!diff) return [];
    const added: Action[] = diff.added.slice().reverse().map((pubkey) => ({ kind: 'followed', pubkey }));
    const removed: Action[] = massRemoval
      ? []
      : diff.removed.slice().reverse().map((pubkey) => ({ kind: 'unfollowed', pubkey }));
    return [...added, ...removed];
  }, [diff, massRemoval]);

  const visible = actions.slice(0, MAX_ACTIONS);
  const overflow = actions.length - visible.length;

  const authorLabel = <span className="font-semibold text-foreground">{authorName}</span>;

  if (!diff?.hasPrevious) return null;
  if (actions.length === 0 && !massRemoval) return null;

  return (
    <div className="mt-2 space-y-1.5">
      {massRemoval && (
        <div className="flex items-center gap-2 rounded-lg bg-rose-500/10 px-3 py-2 text-[13px] leading-snug text-rose-700 dark:text-rose-300">
          <UserMinus className="size-4 shrink-0" />
          <span>
            {isFollowList ? (
              <FormattedMessage
                id="followDiff.nukedFollows"
                defaultMessage="{author} nuked their follow list — removed {count} people"
                values={{ author: authorLabel, count: diff.removed.length }}
              />
            ) : (
              <FormattedMessage
                id="followDiff.nukedList"
                defaultMessage="{author} nuked their list — removed {count} people"
                values={{ author: authorLabel, count: diff.removed.length }}
              />
            )}
          </span>
        </div>
      )}

      {visible.map((action) => (
        <ActionRow
          key={`${action.kind}:${action.pubkey}`}
          action={action}
          authorLabel={authorLabel}
          isFollowList={isFollowList}
        />
      ))}

      {overflow > 0 && (
        <p className="pl-8 text-[13px] text-muted-foreground">
          <FormattedMessage
            id="followDiff.more"
            defaultMessage="+{count} more"
            values={{ count: overflow }}
          />
        </p>
      )}
    </div>
  );
}

function ActionRow({
  action,
  authorLabel,
  isFollowList,
}: {
  action: Action;
  authorLabel: React.ReactNode;
  isFollowList: boolean;
}) {
  const { user } = useCurrentUser();
  const { data: authorsMap } = useAuthors([action.pubkey]);
  const { data: followData } = useFollowList();

  const metadata = authorsMap?.get(action.pubkey)?.metadata;
  const personName = getDisplayName(metadata, action.pubkey);
  const npub = nip19.npubEncode(action.pubkey);

  const alreadyFollowing = !!followData?.pubkeys.includes(action.pubkey);
  const isSelf = user?.pubkey === action.pubkey;
  // Only offer a Follow button for people the author *added* and you don't yet follow.
  const showFollow = action.kind === 'followed' && !alreadyFollowing && !isSelf;

  const personLink = (
    <Link
      to={`/${npub}`}
      onClick={(e) => e.stopPropagation()}
      className="font-semibold text-foreground hover:underline"
    >
      {personName}
    </Link>
  );

  return (
    <div className="flex items-center gap-2">
      <Link
        to={`/${npub}`}
        onClick={(e) => e.stopPropagation()}
        aria-label={personName}
        className="shrink-0"
      >
        <Avatar shape={getAvatarShape(metadata)} className="size-6">
          <AvatarImage src={metadata?.picture} alt={personName} />
          <AvatarFallback className="bg-primary/20 text-primary text-[10px]">
            {personName[0]?.toUpperCase()}
          </AvatarFallback>
        </Avatar>
      </Link>

      <p className="min-w-0 flex-1 text-[13px] leading-snug text-muted-foreground">
        {action.kind === 'followed' ? (
          isFollowList ? (
            <FormattedMessage
              id="followDiff.followedRow"
              defaultMessage="{author} followed {person}"
              values={{ author: authorLabel, person: personLink }}
            />
          ) : (
            <FormattedMessage
              id="followDiff.addedRow"
              defaultMessage="{author} added {person}"
              values={{ author: authorLabel, person: personLink }}
            />
          )
        ) : isFollowList ? (
          <FormattedMessage
            id="followDiff.unfollowedRow"
            defaultMessage="{author} unfollowed {person}"
            values={{ author: authorLabel, person: personLink }}
          />
        ) : (
          <FormattedMessage
            id="followDiff.removedRow"
            defaultMessage="{author} removed {person}"
            values={{ author: authorLabel, person: personLink }}
          />
        )}
      </p>

      {showFollow && <FollowButton pubkey={action.pubkey} className="h-7 shrink-0 px-3 text-xs" />}
    </div>
  );
}
