import { useMemo } from 'react';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useCustomEmojis } from '@/hooks/useCustomEmojis';
import { emojiPackCoord, emojiPackName, KIND_EMOJI_SET, KIND_USER_EMOJIS } from '@/hooks/useEmojiPacks';
import { parseAddr } from '@/lib/parseAddr';
import { parseRelayList } from '@/lib/relayList';
import { isLocalNetworkUrl } from '@/lib/sanitizeUrl';

/** The pack a custom emoji came from — enough to name it and add it. */
export interface EmojiSource {
  /** `30030:pubkey:dtag`. */
  coord: string;
  /** The pack's human name. */
  name: string;
  /** Pack author, for the add mutation. */
  pubkey: string;
  /** The pack's `d` identifier, for the add mutation. */
  identifier: string;
}

/** How many discovery packs to scan when resolving an emoji's origin. */
const DISCOVERY_PACK_LIMIT = 500;

/** Overall budget for one on-demand author-scoped resolution. */
const REMOTE_LOOKUP_TIMEOUT_MS = 6000;

/** Cap on the relays one hop fans out to, taken from someone else's relay list. */
const MAX_HOP_RELAYS = 6;

/**
 * Cap on the pack refs followed from someone else's kind-10030 list. Each ref
 * is its own filter, so an uncapped list of thousands would become a REQ of
 * thousands of filters to every relay asked.
 */
const MAX_LIST_REFS = 50;

/**
 * Index kind-30030 packs by emoji image URL, so the pack behind a reaction's
 * custom emoji can be named without a fresh round-trip per emoji.
 *
 * A reaction tag carries only `["emoji", code, url]` — no pack reference — and
 * relays can't be filtered by emoji URL, so we cast a wide-but-bounded net: a
 * discovery read of recent packs, plus the packs the current user has actually
 * referenced (so their own emojis always resolve). Newest event per coordinate
 * wins; the first pack to claim a URL keeps it, so an emoji copied into a later
 * pack doesn't reattribute the original.
 */
function usePackIndex(enabled: boolean) {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();

  return useQuery({
    queryKey: ['emoji-pack-index', user?.pubkey ?? ''],
    enabled,
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
    queryFn: async ({ signal }): Promise<Map<string, EmojiSource>> => {
      const discovery = await nostr
        .query([{ kinds: [KIND_EMOJI_SET], limit: DISCOVERY_PACK_LIMIT }], { signal })
        .catch(() => [] as NostrEvent[]);

      // The user's own referenced packs, resolved so their emojis are always
      // attributable even if the discovery read didn't surface them.
      let ownPacks: NostrEvent[] = [];
      if (user) {
        const lists = await nostr
          .query([{ kinds: [KIND_USER_EMOJIS], authors: [user.pubkey], limit: 1 }], { signal })
          .catch(() => [] as NostrEvent[]);
        const refs = (lists[0]?.tags ?? [])
          .filter((t) => t[0] === 'a' && t[1])
          .map((t) => parseAddr(t[1]))
          .filter((a): a is NonNullable<typeof a> => !!a && a.kind === KIND_EMOJI_SET);
        if (refs.length > 0) {
          const filters = refs.map((r) => ({
            kinds: [KIND_EMOJI_SET],
            authors: [r.pubkey],
            '#d': [r.identifier],
            limit: 1,
          }));
          ownPacks = await nostr.query(filters, { signal }).catch(() => [] as NostrEvent[]);
        }
      }

      const index = new Map<string, EmojiSource>();
      for (const [coord, ev] of newestPackPerCoord([...discovery, ...ownPacks])) {
        const source = toSource(coord, ev);
        for (const t of ev.tags) {
          if (t[0] === 'emoji' && t[2] && !index.has(t[2])) index.set(t[2], source);
        }
      }
      return index;
    },
  });
}

function toSource(coord: string, ev: NostrEvent): EmojiSource {
  const identifier = ev.tags.find(([n]) => n === 'd')?.[1] ?? '';
  return { coord, name: emojiPackName(ev), pubkey: ev.pubkey, identifier };
}

/** Newest kind-30030 per coordinate, so an edited pack resolves to its current name. */
function newestPackPerCoord(events: NostrEvent[]): Map<string, NostrEvent> {
  const newest = new Map<string, NostrEvent>();
  for (const ev of events) {
    if (ev.kind !== KIND_EMOJI_SET) continue;
    const coord = emojiPackCoord(ev.pubkey, ev.tags.find(([n]) => n === 'd')?.[1] ?? '');
    const prev = newest.get(coord);
    if (!prev || ev.created_at > prev.created_at) newest.set(coord, ev);
  }
  return newest;
}

/**
 * The first (newest-per-coordinate) pack among `events` that claims `url`,
 * considering only packs `accept` vouches for.
 */
function matchPackUrl(
  events: NostrEvent[],
  url: string,
  accept: (coord: string, ev: NostrEvent) => boolean,
): EmojiSource | undefined {
  for (const [coord, ev] of newestPackPerCoord(events)) {
    if (!accept(coord, ev)) continue;
    if (ev.tags.some((t) => t[0] === 'emoji' && t[2] === url)) return toSource(coord, ev);
  }
  return undefined;
}

/**
 * Relays worth asking from someone else's relay list or relay hints: `wss:`
 * only, never a loopback/private host, capped so a hostile list can't make us
 * open dozens of sockets.
 */
function hopRelays(urls: Iterable<string | undefined>): string[] {
  const out = new Set<string>();
  for (const url of urls) {
    if (out.size >= MAX_HOP_RELAYS) break;
    if (!url || !url.startsWith('wss://') || isLocalNetworkUrl(url)) continue;
    out.add(url.replace(/\/+$/, ''));
  }
  return [...out];
}

function writeRelaysOf(events: NostrEvent[], pubkey: string): string[] {
  const list = events
    .filter((e) => e.kind === 10002 && e.pubkey === pubkey)
    .sort((a, b) => b.created_at - a.created_at)[0];
  return list ? parseRelayList(list).filter((r) => r.write).map((r) => r.url) : [];
}

/**
 * Resolve an emoji's pack over the network, scoped to the author who USED it.
 *
 * A `["emoji", code, url]` tag names no pack, so the only principled way to
 * find one is through its user: any custom emoji they typed comes from a pack
 * their kind-10030 list references, or one they authored themselves. Matches
 * after each hop and returns the moment a pack claims the URL:
 *
 *   1. One round on the default pool: the author's authored packs, their
 *      kind-10030 list and their NIP-65 relay list.
 *   2. The author's write relays (plus each list ref's relay hint): their
 *      authored packs and the packs their list references, alongside the
 *      referenced packs on the default pool.
 *   3. Last resort: each referenced pack author's own write relays.
 *
 * Each pool query already stops shortly after the first relay's EOSE, so a
 * slow relay can't pace a hop. Returns undefined when nothing tied to the
 * author claims `url` — the caller then shows no attribution rather than a
 * guess.
 *
 * Hop relays come from someone else's lists and needn't honour our filters,
 * so only packs the author wrote or their list references are ever matched —
 * any other pack a relay volunteers is ignored.
 */
async function resolveEmojiSourceFromAuthor(
  nostr: ReturnType<typeof useNostr>['nostr'],
  authorPubkey: string,
  url: string,
  signal: AbortSignal,
): Promise<EmojiSource | undefined> {
  const deadline = AbortSignal.any([signal, AbortSignal.timeout(REMOTE_LOOKUP_TIMEOUT_MS)]);
  const safeQuery = (run: Promise<NostrEvent[]>) => run.catch(() => [] as NostrEvent[]);

  const authoredFilter: NostrFilter = { kinds: [KIND_EMOJI_SET], authors: [authorPubkey], limit: 100 };
  const listFilter: NostrFilter = { kinds: [KIND_USER_EMOJIS], authors: [authorPubkey], limit: 1 };
  const relayListFilter: NostrFilter = { kinds: [10002], authors: [authorPubkey], limit: 1 };

  // 1. The default pool.
  const gathered = await safeQuery(nostr.query([authoredFilter, listFilter, relayListFilter], { signal: deadline }));
  const byAuthor = (_coord: string, ev: NostrEvent) => ev.pubkey === authorPubkey;
  const first = matchPackUrl(gathered, url, byAuthor);
  if (first) return first;

  const list = gathered
    .filter((e) => e.kind === KIND_USER_EMOJIS && e.pubkey === authorPubkey)
    .sort((a, b) => b.created_at - a.created_at)[0];
  const refs = (list?.tags ?? [])
    .filter((t) => t[0] === 'a' && t[1])
    .map((t) => ({ relayHint: t[2] as string | undefined, addr: parseAddr(t[1]) }))
    .filter((r): r is { relayHint: string | undefined; addr: NonNullable<ReturnType<typeof parseAddr>> } =>
      !!r.addr && r.addr.kind === KIND_EMOJI_SET)
    .slice(0, MAX_LIST_REFS);
  const refCoords = new Set(refs.map((r) => emojiPackCoord(r.addr.pubkey, r.addr.identifier)));
  const vouched = (coord: string, ev: NostrEvent) => byAuthor(coord, ev) || refCoords.has(coord);
  const packFilters: NostrFilter[] = refs.map((r) => ({
    kinds: [KIND_EMOJI_SET],
    authors: [r.addr.pubkey],
    '#d': [r.addr.identifier],
    limit: 1,
  }));

  // 2. The author's own write relays and the refs' relay hints, alongside the
  //    referenced packs on the default pool.
  const authorRelays = hopRelays([...writeRelaysOf(gathered, authorPubkey), ...refs.map((r) => r.relayHint)]);
  const [fromAuthorRelays, refsFromPool] = await Promise.all([
    authorRelays.length > 0
      ? safeQuery(nostr.group(authorRelays).query([authoredFilter, ...packFilters], { signal: deadline }))
      : Promise.resolve([] as NostrEvent[]),
    packFilters.length > 0
      ? safeQuery(nostr.query(packFilters, { signal: deadline }))
      : Promise.resolve([] as NostrEvent[]),
  ]);
  gathered.push(...fromAuthorRelays, ...refsFromPool);
  const second = matchPackUrl(gathered, url, vouched);
  if (second || refs.length === 0 || deadline.aborted) return second;

  // 3. Each referenced pack author's own write relays.
  const packAuthors = [...new Set(refs.map((r) => r.addr.pubkey))];
  const packAuthorLists = await safeQuery(nostr.query([{ kinds: [10002], authors: packAuthors }], { signal: deadline }));
  const packRelays = hopRelays(packAuthors.flatMap((pk) => writeRelaysOf(packAuthorLists, pk)));
  if (packRelays.length === 0) return undefined;
  gathered.push(...await safeQuery(nostr.group(packRelays).query(packFilters, { signal: deadline })));
  return matchPackUrl(gathered, url, vouched);
}

export interface EmojiSourceResult {
  source: EmojiSource | undefined;
  /** The lookup has no answer yet but is still working on one. */
  isLoading: boolean;
}

/**
 * Resolve which NIP-30 pack a custom emoji came from, for a "from <pack>" line
 * and its Add button.
 *
 * Checks the user's own palette first (which carries pack provenance). When
 * that misses and `authorPubkey` — whoever used the emoji — is known, an
 * author-scoped relay lookup ({@link resolveEmojiSourceFromAuthor}) runs next.
 * The discovery pack index is the last resort: anyone can publish a pack
 * claiming any URL, so it must never outrank the author's own packs — and
 * it's a 500-pack read, so it isn't loaded at all unless it's needed. The
 * hook lives in a popover or dialog body, so all of this is a per-open cost,
 * never a fan-out on feed render.
 *
 * `source` stays undefined for an emoji whose pack can't be found anywhere —
 * it is never guessed at.
 */
export function useEmojiSource(url: string | undefined, authorPubkey?: string): EmojiSourceResult {
  const { nostr } = useNostr();
  const { emojis } = useCustomEmojis();

  const own = useMemo((): EmojiSource | undefined => {
    if (!url) return undefined;
    const match = emojis.find((e) => e.url === url && e.packCoord);
    const addr = match?.packCoord ? parseAddr(match.packCoord) : undefined;
    if (!match?.packCoord || !addr) return undefined;
    return {
      coord: match.packCoord,
      name: match.packName || addr.identifier || 'Emoji pack',
      pubkey: addr.pubkey,
      identifier: addr.identifier,
    };
  }, [url, emojis]);

  const wantsRemote = !!url && !!authorPubkey && !own;
  const { data: remote, isFetching, isFetched } = useQuery({
    queryKey: ['emoji-source-remote', url ?? '', authorPubkey ?? ''],
    enabled: wantsRemote,
    staleTime: 30 * 60_000,
    queryFn: async ({ signal }): Promise<EmojiSource | null> =>
      (await resolveEmojiSourceFromAuthor(nostr, authorPubkey!, url!, signal)) ?? null,
  });

  const remoteMissed = !wantsRemote || (isFetched && !remote);
  const wantsIndex = !!url && !own && remoteMissed;
  const { data: index, isPending: indexPending } = usePackIndex(wantsIndex);

  const source = own ?? remote ?? (wantsIndex && url ? index?.get(url) : undefined);
  // Loading covers the whole effort with no answer yet: the author lookup
  // (including the render where `enabled` flips before the fetch is scheduled,
  // and a background refetch over a cached miss), then the index fallback.
  const isLoading = !source && !!url && !own &&
    ((wantsRemote && (isFetching || !isFetched)) || (wantsIndex && indexPending));
  return { source, isLoading };
}
