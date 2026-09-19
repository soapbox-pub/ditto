import { useMemo } from 'react';
import { UserPlus, UserMinus } from 'lucide-react';
import { FormattedMessage, useIntl } from 'react-intl';
import type { NostrEvent } from '@nostrify/nostrify';

import { PeopleAvatarStack } from '@/components/PeopleAvatarStack';
import { useAuthors } from '@/hooks/useAuthors';
import { usePeopleListDiff } from '@/hooks/usePeopleListDiff';
import { getDisplayName } from '@/lib/getDisplayName';
import { cn } from '@/lib/utils';

/** How many names to spell out before collapsing into "and N others". */
const MAX_NAMES = 2;

/**
 * Shows what changed between this people-list version and the previous one:
 * a "Followed" row for newly-added pubkeys and an "Unfollowed" row for removed
 * ones. Renders nothing when there is no previous version to compare against
 * (e.g. the relay doesn't retain history) or when nothing changed.
 */
export function FollowListDiff({ event }: { event: NostrEvent }) {
  const { data: diff } = usePeopleListDiff(event);

  if (!diff?.hasPrevious) return null;
  if (diff.added.length === 0 && diff.removed.length === 0) return null;

  return (
    <div className="mt-2 space-y-2">
      {diff.added.length > 0 && (
        <DiffRow pubkeys={diff.added} variant="added" />
      )}
      {diff.removed.length > 0 && (
        <DiffRow pubkeys={diff.removed} variant="removed" />
      )}
    </div>
  );
}

function DiffRow({ pubkeys, variant }: { pubkeys: string[]; variant: 'added' | 'removed' }) {
  const intl = useIntl();
  const namePubkeys = useMemo(() => pubkeys.slice(0, MAX_NAMES), [pubkeys]);
  const { data: authorsMap } = useAuthors(namePubkeys);

  const names = namePubkeys.map((pk) => getDisplayName(authorsMap?.get(pk)?.metadata, pk));

  const overflow = pubkeys.length - names.length;
  const nameList = intl.formatList(names, { type: 'conjunction' });

  const Icon = variant === 'added' ? UserPlus : UserMinus;

  return (
    <div className="flex items-center gap-2">
      <div
        className={cn(
          'flex size-6 shrink-0 items-center justify-center rounded-full',
          variant === 'added'
            ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
            : 'bg-rose-500/15 text-rose-600 dark:text-rose-400',
        )}
      >
        <Icon className="size-3.5" />
      </div>

      <p className="min-w-0 flex-1 text-[13px] leading-snug text-foreground/90">
        {variant === 'added' ? (
          overflow > 0 ? (
            <FormattedMessage
              id="followDiff.followedOverflow"
              defaultMessage="Followed {names} and {count, plural, one {# other} other {# others}}"
              values={{ names: <span className="font-medium">{nameList}</span>, count: overflow }}
            />
          ) : (
            <FormattedMessage
              id="followDiff.followed"
              defaultMessage="Followed {names}"
              values={{ names: <span className="font-medium">{nameList}</span> }}
            />
          )
        ) : overflow > 0 ? (
          <FormattedMessage
            id="followDiff.unfollowedOverflow"
            defaultMessage="Unfollowed {names} and {count, plural, one {# other} other {# others}}"
            values={{ names: <span className="font-medium">{nameList}</span>, count: overflow }}
          />
        ) : (
          <FormattedMessage
            id="followDiff.unfollowed"
            defaultMessage="Unfollowed {names}"
            values={{ names: <span className="font-medium">{nameList}</span> }}
          />
        )}
      </p>

      <PeopleAvatarStack pubkeys={pubkeys} maxVisible={5} size="sm" className="shrink-0" />
    </div>
  );
}
