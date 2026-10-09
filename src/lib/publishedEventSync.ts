import { NKinds, type NostrEvent } from '@nostrify/nostrify';
import type { InfiniteData, QueryClient } from '@tanstack/react-query';

import { parseAuthorEvent } from '@/hooks/useAuthor';
import { feedItemKey, isReactionKind, isRepostKind, parseRepostContent, type FeedItem } from '@/lib/feedUtils';
import { COMMENT_KINDS, getParentEventId, isReplyEvent } from '@/lib/nostrEvents';
import { addPendingStat, undoPendingStat, type StatField } from '@/lib/pendingStats';

/**
 * Keeps every cached view of the user's content in step with what they
 * publish, so the whole app reacts at once instead of after a refetch.
 *
 * `syncPublishedEvent` runs after every successful publish (see
 * `useNostrPublish`). It writes straight into the query cache, the way the
 * data would look once relays have the event:
 *
 * - **Feeds.** Posts, reposts, and reactions are inserted into the Follows
 *   feed, the user's profile (posts, media, likes), author-scoped saved
 *   feeds, and hashtag / geotag tabs — each only if its own filter would
 *   return the event (kinds enabled, tags, reply setting).
 * - **Replacements.** A new version of a replaceable or addressable event
 *   replaces the old card, and seeds `['addr-event']` and (for kind 0)
 *   `['author']`.
 * - **Deletions.** A kind 5 removes its targets everywhere, and a deleted
 *   reaction's post from the profile's likes.
 * - **Counts.** Reactions, reposts, and replies count toward their target's
 *   stats until the stats provider catches up (see `pendingStats`).
 *
 * Feeds are marked stale WITHOUT refetching: an immediate refetch races the
 * relay's write→read indexing and wholesale-replaces the cached pages,
 * swallowing the inserted item.
 */

/** A page of a `FeedItem` infinite query: `['feed']`, `['profile-feed']`, `['tab-feed']`. */
interface ItemPage {
  items: FeedItem[];
}

/**
 * A page of a plain event infinite query: `['profile-media']` and
 * `['profile-likes-infinite']` (`events`), `['wall-comments']` (`comments`).
 */
type EventPage = Record<string, NostrEvent[]>;

const ITEM_FEEDS = ['feed', 'profile-feed', 'tab-feed'] as const;
/** Plain event infinite queries, and the page field holding their events. */
const EVENT_PAGE_FIELDS: Record<string, string> = {
  'profile-media': 'events',
  'profile-likes-infinite': 'events',
  'wall-comments': 'comments',
};
const EVENT_PAGE_FEEDS = Object.keys(EVENT_PAGE_FIELDS);
const EVENT_LIST_FEEDS = ['hashtag-feed', 'geotag-feed'] as const;

/** Kinds `useProfileSupplementary` reads: follows, pins, Love List, Top 8, interests, identities, streak. */
const PROFILE_SUPPLEMENTARY_KINDS = new Set([3, 10001, 15683, 18678, 10015, 10011, 13473]);

/** Kinds `useProfileMedia` queries. */
export const PROFILE_MEDIA_KINDS = [1, 20, 21, 22, 34235, 34236, 36787, 34139, 30054, 30055];

/** Events a kind 5 deletes, read before it was published (afterward the store no longer has them). */
export interface PublishContext {
  deleted?: NostrEvent[];
}

export function syncPublishedEvent(queryClient: QueryClient, event: NostrEvent, context: PublishContext = {}): void {
  queryClient.setQueryData(['event', event.id], event);

  if (event.kind === 5) {
    syncDeletion(queryClient, event, context.deleted ?? []);
    return;
  }

  if (NKinds.replaceable(event.kind) || NKinds.addressable(event.kind)) {
    syncReplacement(queryClient, event);
  }

  const target = isRepostKind(event.kind) || isReactionKind(event.kind)
    ? findTarget(queryClient, event)
    : undefined;

  const stat = getStatTarget(event);
  if (stat) addPendingStat(stat.target, stat.field, event);

  // A repost or reaction can't render without the note it wraps; the next
  // refetch resolves it.
  if ((isRepostKind(event.kind) || isReactionKind(event.kind)) && !target) {
    markFeedsStale(queryClient);
    return;
  }

  insertIntoFeeds(queryClient, event, target);
}

// ---------------------------------------------------------------------------
// Deletion and replacement
// ---------------------------------------------------------------------------

function syncDeletion(queryClient: QueryClient, deletion: NostrEvent, deleted: NostrEvent[]): void {
  const ids = new Set(deletion.tags.filter(([name]) => name === 'e').map(([, id]) => id));
  const addrs = new Set(deletion.tags.filter(([name]) => name === 'a').map(([, addr]) => addr));
  const isDeleted = (event: NostrEvent | undefined): boolean =>
    !!event && event.pubkey === deletion.pubkey && (
      ids.has(event.id) ||
      (NKinds.addressable(event.kind) && addrs.has(addrOf(event)) && event.created_at <= deletion.created_at)
    );

  // Everything the deletion names that we can see: what was read before
  // publishing, plus whatever the caches hold.
  const targets = new Map<string, NostrEvent>();
  for (const event of deleted) if (isDeleted(event)) targets.set(event.id, event);
  for (const id of ids) {
    const cached = targets.get(id) ?? findCachedEvent(queryClient, id);
    if (cached && isDeleted(cached)) targets.set(id, cached);
  }

  // Undo the counts, and the likes, of deleted reactions / reposts / replies.
  const unliked = new Set<string>();
  for (const target of targets.values()) {
    const stat = getStatTarget(target);
    if (stat) undoPendingStat(stat.target, stat.field, target, deletion);
    if (isReactionKind(target.kind)) {
      const liked = getReactionTargetId(target);
      if (liked) unliked.add(liked);
    }
  }

  removeFromFeeds(queryClient, (item) =>
    (isDirectItem(item) && isDeleted(item.event)) ||
    isDeleted(item.repostEvent) ||
    isDeleted(item.reactedBy?.event) ||
    isDeleted(item.zappedBy?.event),
  );
  removeFromEventFeeds(queryClient, (event, queryKey) =>
    isDeleted(event) || (queryKey[0] === 'profile-likes-infinite' && queryKey[1] === deletion.pubkey && unliked.has(event.id)),
  );
  markFeedsStale(queryClient);
}

function syncReplacement(queryClient: QueryClient, event: NostrEvent): void {
  const d = NKinds.addressable(event.kind) ? getDTag(event) : '';
  queryClient.setQueryData(['addr-event', event.kind, event.pubkey, d], event);
  if (event.kind === 0) queryClient.setQueryData(['author', event.pubkey], parseAuthorEvent(event));

  const isOlderVersion = (other: NostrEvent) =>
    other.id !== event.id &&
    other.kind === event.kind &&
    other.pubkey === event.pubkey &&
    (!NKinds.addressable(event.kind) || getDTag(other) === d);
  removeFromFeeds(queryClient, (item) => isDirectItem(item) && isOlderVersion(item.event));
  removeFromEventFeeds(queryClient, isOlderVersion);

  // The profile header's counts and lists. Safe to refetch right away: the
  // pool keeps the version just published (see reconcileOwnEvents).
  if (PROFILE_SUPPLEMENTARY_KINDS.has(event.kind)) {
    queryClient.invalidateQueries({ queryKey: ['profile-supplementary', event.pubkey] });
  }
}

// ---------------------------------------------------------------------------
// Insertion
// ---------------------------------------------------------------------------

function insertIntoFeeds(queryClient: QueryClient, event: NostrEvent, target?: NostrEvent): void {
  const item: FeedItem = !target
    ? { event, sortTimestamp: event.created_at }
    : isReactionKind(event.kind)
      ? { event: target, reactedBy: { event, pubkey: event.pubkey }, sortTimestamp: event.created_at }
      : { event: target, repostedBy: event.pubkey, repostEvent: event, sortTimestamp: event.created_at };
  const key = feedItemKey(item);

  for (const name of ITEM_FEEDS) {
    for (const query of queryClient.getQueryCache().findAll({ queryKey: [name] })) {
      if (!itemFeedIncludes(query.queryKey, event, item.event)) continue;
      queryClient.setQueryData<InfiniteData<ItemPage>>(query.queryKey, (data) =>
        insertSorted(data, 'items', item, item.sortTimestamp, (other) =>
          // Already there, or the note itself is: `dedupeFeedItems` keeps
          // the note over any repost / reaction of it.
          feedItemKey(other) === key || (!!target && other.event.id === target.id && isDirectItem(other)),
        ),
      );
    }
  }

  // Plain event lists: the user's own posts by tag or media, and the posts they liked.
  const listed = isReactionKind(event.kind) ? target : (target ? undefined : event);
  if (listed) {
    for (const name of [...EVENT_PAGE_FEEDS, ...EVENT_LIST_FEEDS]) {
      for (const query of queryClient.getQueryCache().findAll({ queryKey: [name] })) {
        if (!eventFeedIncludes(query.queryKey, event)) continue;
        const has = (other: NostrEvent) => other.id === listed.id;
        if (name === 'hashtag-feed' || name === 'geotag-feed') {
          queryClient.setQueryData<NostrEvent[]>(query.queryKey, (list) =>
            !list || list.some(has) ? list : [listed, ...list],
          );
        } else {
          queryClient.setQueryData<InfiniteData<EventPage>>(query.queryKey, (data) =>
            insertSorted(data, EVENT_PAGE_FIELDS[name], listed, event.created_at, has, name === 'profile-likes-infinite'),
          );
        }
      }
    }
  }

  markFeedsStale(queryClient);
}

/**
 * Insert `value` into the first page of an infinite query in time order. An
 * entry older than the whole first page (a backdated event) belongs on a
 * later page and is left out. `atTop` puts it first regardless (the likes
 * list is ordered by when the post was liked, not when it was written).
 */
function insertSorted<Entry extends FeedItem | NostrEvent, P extends object>(
  data: InfiniteData<P> | undefined,
  field: string,
  value: Entry,
  timestamp: number,
  present: (other: Entry) => boolean,
  atTop = false,
): InfiniteData<P> | undefined {
  const [first, ...rest] = data?.pages ?? [];
  const list = (first as Record<string, Entry[] | undefined> | undefined)?.[field];
  if (!data || !first || !Array.isArray(list) || list.some(present)) return data;

  const time = (entry: Entry) => 'sortTimestamp' in entry ? entry.sortTimestamp : entry.created_at;
  let index = atTop ? 0 : list.findIndex((other) => time(other) <= timestamp);
  if (index === -1) {
    if (rest.length > 0) return data;
    index = list.length;
  }
  const next = [...list.slice(0, index), value, ...list.slice(index)];
  return { ...data, pages: [{ ...first, [field]: next }, ...rest] };
}

/**
 * Whether a cached `FeedItem` query would return the user's `event`, reading
 * the query keys the hooks write:
 *
 * - `['feed', tab, userPubkey, kindsKey, tagFiltersKey, communityCount, showReplies, ...]`
 *   (`useFeed`). Only the Follows tab: Global is hot-sorted, and Loved and
 *   Communities are other people's posts.
 * - `['profile-feed', pubkey, kindsKey, tab]` (`useProfileFeed`). The tab
 *   is filtered at render.
 * - `['tab-feed', tabKey, kindsKey, authorsKey, searchKey]` (`useTabFeed`).
 *   Only author-scoped feeds without a search, which a relay may rank or
 *   filter in ways we can't reproduce.
 */
function itemFeedIncludes(queryKey: readonly unknown[], event: NostrEvent, shown: NostrEvent): boolean {
  const hasKind = (kindsKey: unknown) =>
    typeof kindsKey === 'string' && kindsKey.split(',').includes(String(event.kind));

  switch (queryKey[0]) {
    case 'feed': {
      const [, tab, userPubkey, kindsKey, tagFiltersKey, , showReplies] = queryKey;
      if (tab !== 'follows' || userPubkey !== event.pubkey || !hasKind(kindsKey)) return false;
      if (showReplies === false && isReplyEvent(shown)) return false;
      return matchesTagFilters(event, tagFiltersKey);
    }
    case 'profile-feed': {
      const [, pubkey, kindsKey] = queryKey;
      return pubkey === event.pubkey && hasKind(kindsKey);
    }
    case 'tab-feed': {
      const [, , kindsKey, authorsKey, searchKey] = queryKey;
      return !searchKey && typeof authorsKey === 'string' &&
        authorsKey.split(',').includes(event.pubkey) && hasKind(kindsKey);
    }
    default:
      return false;
  }
}

/**
 * Whether a cached plain-event query would return the user's `event`:
 *
 * - `['profile-media', pubkey]` (`useProfileMedia`): media posts.
 * - `['profile-likes-infinite', pubkey]` (`useProfileLikes`): reactions,
 *   listed as the post reacted to.
 * - `['wall-comments', pubkey, ...]` (`useWallComments`): comments on the
 *   profile.
 * - `['hashtag-feed', tag, kindsKey]` / `['geotag-feed', tag, kindsKey]` (`Feed`).
 */
function eventFeedIncludes(queryKey: readonly unknown[], event: NostrEvent): boolean {
  const [name, keyA, kindsKey] = queryKey;
  const hasKind = typeof kindsKey === 'string' && kindsKey.split(',').includes(String(event.kind));

  switch (name) {
    case 'profile-media':
      return keyA === event.pubkey && PROFILE_MEDIA_KINDS.includes(event.kind) && hasMedia(event);
    case 'profile-likes-infinite':
      return keyA === event.pubkey && isReactionKind(event.kind);
    case 'wall-comments':
      return COMMENT_KINDS.has(event.kind) && event.tags.some(([n, v]) => n === 'A' && v === `0:${keyA}:`);
    case 'hashtag-feed':
      return hasKind && typeof keyA === 'string' &&
        event.tags.some(([n, v]) => n === 't' && v?.toLowerCase() === keyA.toLowerCase());
    case 'geotag-feed':
      return hasKind && event.tags.some(([n, v]) => n === 'g' && v === keyA);
    default:
      return false;
  }
}

/** Whether `event` matches a `useFeed` tag-filter key (`JSON.stringify` of `{ '#x': [...] }`). */
function matchesTagFilters(event: NostrEvent, tagFiltersKey: unknown): boolean {
  if (typeof tagFiltersKey !== 'string' || !tagFiltersKey) return true;
  let tagFilters: Record<string, unknown>;
  try {
    tagFilters = JSON.parse(tagFiltersKey);
  } catch {
    return false;
  }
  return Object.entries(tagFilters).every(([key, values]) =>
    key.startsWith('#') && Array.isArray(values) &&
    event.tags.some(([n, v]) => n === key.slice(1) && values.includes(v)),
  );
}

/** Roughly what the relay's `media:true` search matches: a non-text kind, or a note with attached media. */
function hasMedia(event: NostrEvent): boolean {
  if (event.kind !== 1) return true;
  return event.tags.some(([name]) => name === 'imeta') ||
    /https?:\/\/[^\s]+\.(jpg|jpeg|png|gif|webp|svg|mp4|webm|mov)(\?[^\s]*)?/i.test(event.content);
}

// ---------------------------------------------------------------------------
// Cache helpers
// ---------------------------------------------------------------------------

function removeFromFeeds(queryClient: QueryClient, matches: (item: FeedItem) => boolean): void {
  for (const name of ITEM_FEEDS) {
    queryClient.setQueriesData<InfiniteData<ItemPage>>({ queryKey: [name] }, (data) => {
      if (!data?.pages?.some((page) => page.items?.some(matches))) return data;
      return { ...data, pages: data.pages.map((page) => ({ ...page, items: page.items.filter((item) => !matches(item)) })) };
    });
  }
}

function removeFromEventFeeds(
  queryClient: QueryClient,
  matches: (event: NostrEvent, queryKey: readonly unknown[]) => boolean,
): void {
  for (const name of EVENT_PAGE_FEEDS) {
    const field = EVENT_PAGE_FIELDS[name];
    for (const query of queryClient.getQueryCache().findAll({ queryKey: [name] })) {
      const test = (event: NostrEvent) => matches(event, query.queryKey);
      queryClient.setQueryData<InfiniteData<EventPage>>(query.queryKey, (data) => {
        if (!data?.pages?.some((page) => page[field]?.some(test))) return data;
        return {
          ...data,
          pages: data.pages.map((page) => ({ ...page, [field]: page[field]?.filter((e) => !test(e)) ?? [] })),
        };
      });
    }
  }
  for (const name of EVENT_LIST_FEEDS) {
    for (const query of queryClient.getQueryCache().findAll({ queryKey: [name] })) {
      const test = (event: NostrEvent) => matches(event, query.queryKey);
      queryClient.setQueryData<NostrEvent[]>(query.queryKey, (list) =>
        list?.some(test) ? list.filter((e) => !test(e)) : list,
      );
    }
  }
}

function markFeedsStale(queryClient: QueryClient): void {
  for (const name of [...ITEM_FEEDS, ...EVENT_PAGE_FEEDS, ...EVENT_LIST_FEEDS]) {
    queryClient.invalidateQueries({ queryKey: [name], refetchType: 'none' });
  }
}

/**
 * Find an event already in the query cache: the `['event', id, ...]` queries
 * first, then the feeds (a card being reacted to or reposted from a feed is
 * always there).
 */
function findCachedEvent(queryClient: QueryClient, id: string): NostrEvent | undefined {
  for (const [, data] of queryClient.getQueriesData<NostrEvent | null>({ queryKey: ['event', id] })) {
    if (data?.id === id) return data;
  }
  for (const name of ITEM_FEEDS) {
    for (const [, data] of queryClient.getQueriesData<InfiniteData<ItemPage>>({ queryKey: [name] })) {
      for (const page of data?.pages ?? []) {
        for (const item of page.items ?? []) {
          if (item.event.id === id) return item.event;
          if (item.repostEvent?.id === id) return item.repostEvent;
          if (item.reactedBy?.event.id === id) return item.reactedBy.event;
        }
      }
    }
  }
  return undefined;
}

/** The note a repost or reaction wraps, if it's at hand. */
function findTarget(queryClient: QueryClient, event: NostrEvent): NostrEvent | undefined {
  if (isRepostKind(event.kind)) {
    const embedded = parseRepostContent(event);
    if (embedded) return embedded;
    const id = event.tags.find(([name]) => name === 'e')?.[1];
    return id ? findCachedEvent(queryClient, id) : undefined;
  }
  const id = getReactionTargetId(event);
  return id ? findCachedEvent(queryClient, id) : undefined;
}

/** A reaction's target is its last `e` tag (NIP-25). */
function getReactionTargetId(event: NostrEvent): string | undefined {
  return event.tags.filter(([name]) => name === 'e').at(-1)?.[1];
}

/**
 * Which stats count `event`, and under which key (an event id, or for an
 * addressable target its address, matching `useEventStats`).
 */
function getStatTarget(event: NostrEvent): { target: string; field: StatField } | undefined {
  const addr = event.tags.find(([name]) => name === 'a')?.[1];
  if (isReactionKind(event.kind)) {
    const id = getReactionTargetId(event);
    return id ? { target: id, field: 'reactionCount' } : undefined;
  }
  if (isRepostKind(event.kind)) {
    const target = addr ?? event.tags.find(([name]) => name === 'e')?.[1];
    return target ? { target, field: 'repostCount' } : undefined;
  }
  if (COMMENT_KINDS.has(event.kind) || (event.kind === 1 && isReplyEvent(event))) {
    const target = getParentEventId(event) ?? (COMMENT_KINDS.has(event.kind) ? addr : undefined);
    return target ? { target, field: 'commentCount' } : undefined;
  }
  return undefined;
}

function isDirectItem(item: FeedItem): boolean {
  return !item.repostedBy && !item.reactedBy && !item.zappedBy && !item.profileZapRecipient;
}

function getDTag(event: NostrEvent): string {
  return event.tags.find(([name]) => name === 'd')?.[1] ?? '';
}

function addrOf(event: NostrEvent): string {
  return `${event.kind}:${event.pubkey}:${getDTag(event)}`;
}
