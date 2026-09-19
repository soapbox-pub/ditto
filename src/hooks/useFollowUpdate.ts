import { useMemo } from 'react';
import { defineMessage, type MessageDescriptor } from 'react-intl';
import type { NostrEvent, NostrMetadata } from '@nostrify/nostrify';

import { useAuthors } from '@/hooks/useAuthors';
import { usePeopleListDiff } from '@/hooks/usePeopleListDiff';
import { isNostrId } from '@/lib/nostrId';

/** Most people to show across both sections before collapsing into "and N more". */
export const MAX_FOLLOW_ACTIONS = 3;
/** A removal this large is treated as a wipe rather than listed person-by-person. */
export const NUKE_THRESHOLD = 10;

/**
 * What kind of update this follow-list version represents.
 *
 * - `loading`: still fetching the previous version.
 * - `follow`: the author followed someone (may also include unfollows).
 * - `nuke`: a mass unfollow, no new follows.
 * - `unfollow`: a small number of unfollows, no new follows.
 * - `latest`: no previous version on the relay, so we show recent follows.
 * - `none`: a previous version exists but nothing changed.
 */
export type FollowUpdateMode = 'loading' | 'follow' | 'nuke' | 'unfollow' | 'latest' | 'none';

export interface FollowUpdate {
  mode: FollowUpdateMode;
  /** Newly followed pubkeys to show, newest first, capped. */
  follows: string[];
  /** Unfollowed pubkeys to show, newest first, capped. Empty on a nuke. */
  unfollows: string[];
  followOverflow: number;
  unfollowOverflow: number;
  /** Total removed, used by the nuke notice. */
  removedCount: number;
  /** Most recent follows, for the `latest` fallback. */
  latest: string[];
  peopleMeta: Map<string, { metadata?: NostrMetadata }> | undefined;
}

/** Verb that follows the author's name for each mode, e.g. "chad started following". */
export const FOLLOW_UPDATE_VERB: Record<Exclude<FollowUpdateMode, 'loading'>, MessageDescriptor> = {
  follow: defineMessage({ id: 'followDiff.verb.follow', defaultMessage: 'started following' }),
  nuke: defineMessage({ id: 'followDiff.verb.nuke', defaultMessage: 'nuked their follow list' }),
  unfollow: defineMessage({ id: 'followDiff.verb.unfollow', defaultMessage: 'stopped following' }),
  latest: defineMessage({ id: 'followDiff.verb.latest', defaultMessage: 'follows' }),
  none: defineMessage({ id: 'followDiff.verb.none', defaultMessage: 'updated their follow list' }),
};

/**
 * Derive the follow update for a kind 3 event by diffing it against the
 * previous version the relay retained (a Ditto relay feature; ordinary relays
 * drop old versions and this degrades to `latest`). Batch-fetches profile
 * metadata for everyone who will be shown.
 */
export function useFollowUpdate(event: NostrEvent): FollowUpdate {
  const { data: diff, isLoading } = usePeopleListDiff(event);

  const massRemoval = (diff?.removed.length ?? 0) >= NUKE_THRESHOLD;

  // Newest follows are appended last on kind 3, so reverse to surface them first.
  // Follows take the slots first; unfollows get whatever is left.
  const { follows, unfollows, followOverflow, unfollowOverflow } = useMemo(() => {
    const added = diff?.added.slice().reverse() ?? [];
    const removed = massRemoval ? [] : diff?.removed.slice().reverse() ?? [];
    const follows = added.slice(0, MAX_FOLLOW_ACTIONS);
    const unfollows = removed.slice(0, Math.max(0, MAX_FOLLOW_ACTIONS - follows.length));
    return {
      follows,
      unfollows,
      followOverflow: added.length - follows.length,
      unfollowOverflow: removed.length - unfollows.length,
    };
  }, [diff, massRemoval]);

  const latest = useMemo(
    () =>
      event.tags
        .filter(([n]) => n === 'p')
        .map(([, pk]) => pk)
        .filter(isNostrId)
        .reverse()
        .slice(0, MAX_FOLLOW_ACTIONS),
    [event.tags],
  );

  let mode: FollowUpdateMode;
  if (isLoading) mode = 'loading';
  else if (!diff?.hasPrevious) mode = latest.length > 0 ? 'latest' : 'none';
  else if (follows.length > 0) mode = 'follow';
  else if (massRemoval) mode = 'nuke';
  else if (unfollows.length > 0) mode = 'unfollow';
  else mode = 'none';

  const previewPubkeys = useMemo(
    () => (mode === 'latest' ? latest : [...follows, ...unfollows]),
    [mode, latest, follows, unfollows],
  );
  const { data: peopleMeta } = useAuthors(previewPubkeys);

  return {
    mode,
    follows,
    unfollows,
    followOverflow,
    unfollowOverflow,
    removedCount: diff?.removed.length ?? 0,
    latest,
    peopleMeta,
  };
}
