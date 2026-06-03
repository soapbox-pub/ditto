import type { NostrEvent, NPool } from '@nostrify/nostrify';
import { getZapAmountSats, getZapSenderPubkey, getTargetEventId } from '@/lib/zapHelpers';

/**
 * Minimum gap (in seconds) between consecutive events to be considered an
 * out-of-sync boundary. If a relay returns events spanning a large time
 * range (e.g., 10h newest → 4d oldest), there will be a large gap between
 * the "main cluster" and the outliers from the stale relay.
 */
const MIN_GAP_SECONDS = 6 * 60 * 60; // 6 hours

/**
 * Computes a safe pagination cursor from a set of events.
 *
 * When querying multiple relays, a stale relay may return very old events
 * alongside recent ones. Using the absolute oldest timestamp as the cursor
 * would skip everything in between. This function detects large gaps in the
 * timestamp distribution and returns the oldest timestamp from the main
 * (most recent) cluster, ignoring outliers below the gap.
 *
 * All events are still returned and displayed — only the cursor is adjusted.
 */
export function getPaginationCursor(events: NostrEvent[]): number {
  if (events.length === 0) return Math.floor(Date.now() / 1000);
  if (events.length === 1) return events[0].created_at;

  // Sort descending (newest first).
  const sorted = events.map((e) => e.created_at).sort((a, b) => b - a);

  // Walk from newest to oldest, find the first gap larger than the threshold.
  for (let i = 0; i < sorted.length - 1; i++) {
    const gap = sorted[i] - sorted[i + 1];
    if (gap >= MIN_GAP_SECONDS) {
      // The cursor is the timestamp just above the gap (the oldest event
      // in the main cluster). Events below the gap are outliers.
      return sorted[i];
    }
  }

  // No large gap found — all events are in one cluster.
  return sorted[sorted.length - 1];
}

/** The set of kind numbers that represent reposts (kind 6 for notes, kind 16 for everything else). */
export const REPOST_KINDS = new Set([6, 16]);

/** Check if a kind number is a repost kind (6 or 16). */
export function isRepostKind(kind: number): boolean {
  return REPOST_KINDS.has(kind);
}

/** The set of kind numbers that represent reactions. */
export const REACTION_KINDS = new Set([7]);

/** Check if a kind number is a reaction kind (7). */
export function isReactionKind(kind: number): boolean {
  return REACTION_KINDS.has(kind);
}

/** The set of kind numbers that represent zap events (Lightning + on-chain). */
export const ZAP_KINDS = new Set([9735, 8333]);

/** Check if a kind number is a zap kind (9735 Lightning or 8333 on-chain). */
export function isZapKind(kind: number): boolean {
  return ZAP_KINDS.has(kind);
}

/**
 * Returns the correct repost kind for a given event.
 * Kind 6 is only for reposting kind 1 text notes; kind 16 is for everything else.
 */
export function getRepostKind(originalEventKind: number): number {
  return originalEventKind === 1 ? 6 : 16;
}

/** Overlay describing a reaction (kind 7) made to a target event. */
export interface ReactionOverlay {
  /** The reaction event itself (used for linking to the underlying nevent). */
  event: NostrEvent;
  /** Pubkey of the person who reacted. */
  pubkey: string;
}

/** Overlay describing a zap (kind 9735 Lightning or kind 8333 on-chain). */
export interface ZapOverlay {
  /** The zap event itself (used for linking to the underlying nevent). */
  event: NostrEvent;
  /** Pubkey of the sender (resolved through P-tag / description / event.pubkey). */
  pubkey: string;
  /** Zap amount in sats. May be 0 if unparseable. */
  sats: number;
}

/** A feed item — either a direct post, a repost, a reaction, or a zap wrapping the original event. */
export interface FeedItem {
  /**
   * The event to display. For direct posts this is the post itself; for
   * reposts / reactions / zaps wrapping a note it's the target note (the
   * wrapper lives in `repostedBy` / `reactedBy` / `zappedBy`). For a
   * profile-targeted zap (no `e` tag) it's the zap event itself — see
   * `profileZapRecipient` below.
   */
  event: NostrEvent;
  /** If this item is a repost, the pubkey of the person who reposted it. */
  repostedBy?: string;
  /** If this item is a repost and we have the wrapper event, the kind 6 / 16 repost event itself (used for linking "reposted" to its nevent). */
  repostEvent?: NostrEvent;
  /** If this item is a reaction overlay, the reaction event + actor pubkey. */
  reactedBy?: ReactionOverlay;
  /** If this item is a zap overlay, the zap event + sender pubkey + amount. */
  zappedBy?: ZapOverlay;
  /**
   * If set, this item is a profile-targeted zap (a kind 9735 / 8333 event
   * with a `p` tag but no `e`/`a` tag — i.e. tipping a person, not a
   * specific note). `event` is the zap event itself and this field holds
   * the recipient pubkey from the `p` tag. NoteCard renders these with
   * the normal post layout, showing "Zapped @recipient" as a context
   * line above the amount.
   */
  profileZapRecipient?: string;
  /** Sort timestamp — uses the wrapper event's timestamp when present for correct ordering. */
  sortTimestamp: number;
}

/**
 * Compute a stable React key / dedup key for a feed item. The same target
 * event can appear with multiple wrappers (a repost AND a reaction AND a
 * zap), so the key incorporates the wrapper event id when present.
 *
 * Zaps are keyed by the zap event id alone (not the target id) so that
 * the same zap rendering as a `zappedBy` overlay on one page and as a
 * `profileZapRecipient` fallback on another (because the target note
 * resolved on one page but not the other) collide during cross-page
 * dedup and only render once.
 */
export function feedItemKey(item: FeedItem): string {
  if (item.reactedBy) return `reaction-${item.reactedBy.event.id}-${item.event.id}`;
  if (item.zappedBy) return `zap-${item.zappedBy.event.id}`;
  if (item.repostedBy) return `repost-${item.repostedBy}-${item.event.id}`;
  // Profile-targeted zap — the zap event itself IS `item.event`, so its
  // id is already unique. Use the same `zap-` prefix as `zappedBy` so
  // both variants of the same zap dedup against each other.
  if (item.profileZapRecipient) return `zap-${item.event.id}`;
  return item.event.id;
}

/** d-tags reserved by NIP-51 for other purposes — hide these kind 30000 events from feeds. */
const DEPRECATED_DTAGS = new Set(['mute', 'pin', 'bookmark', 'communities']);

/** Returns true if a kind 30000 event is a deprecated/junk list that should be hidden. */
function isDeprecatedFollowSet(event: NostrEvent): boolean {
  if (event.kind !== 30000) return false;
  const dTag = event.tags.find(([n]) => n === 'd')?.[1] ?? '';
  if (DEPRECATED_DTAGS.has(dTag)) return true;
  const hasPTags = event.tags.some(([n]) => n === 'p');
  const hasTitle = event.tags.some(([n]) => n === 'title' || n === 'name');
  if (!hasPTags && !hasTitle) return true;
  return false;
}

/**
 * Returns true if a feed event should be hidden at the feed level.
 * This pre-filters events BEFORE they are rendered as NoteCards,
 * preventing unnecessary component mounts and layout shifts from
 * components that would return null.
 */
export function shouldHideFeedEvent(event: NostrEvent): boolean {
  // Deprecated kind 30000 follow sets
  if (isDeprecatedFollowSet(event)) return true;
  // Unlisted magic decks (kind 37381)
  if (event.kind === 37381 && event.tags.some(([n, v]) => n === 't' && v === 'unlisted')) return true;
  // Hidden treasures (kind 37516)
  if (event.kind === 37516 && event.tags.some(([n, v]) => n === 't' && v === 'hidden')) return true;
  // Emoji packs (kind 30030) without at least one valid emoji tag
  if (event.kind === 30030 && !event.tags.some(([n, sc, url]) => n === 'emoji' && sc && url)) return true;
  // Bird detections (kind 2473) without a Wikidata entity reference — the NIP
  // requires an `i` tag pointing at https://www.wikidata.org/entity/Q<digits>.
  if (event.kind === 2473) {
    const wikidataRe = /^https:\/\/www\.wikidata\.org\/entity\/Q\d+$/;
    if (!event.tags.some(([n, v]) => n === 'i' && typeof v === 'string' && wikidataRe.test(v))) return true;
  }
  // Birdex life lists (kind 12473) with no valid species entries — a
  // Birdex is an index over the author's kind 2473 detections, so one
  // with zero parseable `i` tags has nothing to show.
  if (event.kind === 12473) {
    const wikidataRe = /^https:\/\/www\.wikidata\.org\/entity\/Q\d+$/;
    if (!event.tags.some(([n, v]) => n === 'i' && typeof v === 'string' && wikidataRe.test(v))) return true;
  }
  // Custom constellations (kind 30621) without any valid edge tags
  if (event.kind === 30621) {
    const hasEdge = event.tags.some(([n, from, to]) => n === 'edge' && /^\d+$/.test(from ?? '') && /^\d+$/.test(to ?? ''));
    if (!hasEdge) return true;
  }
  // NIP-84 highlights (kind 9802) with no excerpt AND no source reference.
  // Either is required to have anything meaningful to render.
  if (event.kind === 9802) {
    const hasContent = event.content.trim().length > 0;
    const hasSource = event.tags.some(([n]) => n === 'a' || n === 'e' || n === 'r');
    if (!hasContent && !hasSource) return true;
  }
  // Fundraisers (kind 33863) without a title, `d`, or any `w` wallet
  // tag have nothing to render and nothing to donate to. We skip the
  // full bech32(m) check here (parseCampaign does that at the render
  // site) — a quick tag-presence gate is enough to keep blank cards
  // out of the feed without paying for address validation per event.
  if (event.kind === 33863) {
    const hasTitle = event.tags.some(([n, v]) => n === 'title' && typeof v === 'string' && v.trim().length > 0);
    const hasD = event.tags.some(([n, v]) => n === 'd' && typeof v === 'string' && v.length > 0);
    const hasWallet = event.tags.some(([n, v]) => n === 'w' && typeof v === 'string' && v.length > 0);
    if (!hasTitle || !hasD || !hasWallet) return true;
  }
  return false;
}

/**
 * Turn a list of raw events into FeedItems, unwrapping reposts /
 * reactions / zaps so that the target event becomes the FeedItem's
 * primary `event` and the wrapper is surfaced as an overlay
 * (repostedBy / reactedBy / zappedBy). Any wrapper whose target
 * isn't in `events` is fetched in a single batched query.
 *
 * Used by every feed hook (home, profile, custom tab) so that reactions
 * and zaps render consistently — as a header over the target post,
 * never as a standalone activity card.
 */
export async function buildFeedItems(
  events: NostrEvent[],
  nostr: NPool,
  signal: AbortSignal,
): Promise<FeedItem[]> {
  const now = Math.floor(Date.now() / 1000);
  const items: FeedItem[] = [];

  // Map of target-event id → list of wrappers that need it. A single
  // target can have multiple wrappers (e.g. several reactions to one
  // post), so we store an array. Zap wrappers carry an optional
  // `recipientPubkey` (from the `p` tag) so that if the target note
  // can't be resolved, we can still surface the zap as a standalone
  // profile-zap card rather than silently dropping it.
  type PendingWrapper =
    | { type: 'repost'; event: NostrEvent }
    | { type: 'reaction'; event: NostrEvent }
    | { type: 'zap'; event: NostrEvent; recipientPubkey?: string };
  const missingTargets = new Map<string, PendingWrapper[]>();

  const queueMissing = (id: string, wrapper: PendingWrapper) => {
    const existing = missingTargets.get(id);
    if (existing) existing.push(wrapper);
    else missingTargets.set(id, [wrapper]);
  };

  // Index events by id so we can resolve targets that arrived in the
  // same page without an extra query.
  const eventsById = new Map<string, NostrEvent>();
  for (const ev of events) eventsById.set(ev.id, ev);

  for (const ev of events) {
    if (isRepostKind(ev.kind)) {
      // Kind 6 / 16 — repost. Prefer the embedded JSON; fall back to
      // resolving the `e` tag.
      const embedded = parseRepostContent(ev);
      if (embedded && embedded.created_at <= now) {
        items.push({ event: embedded, repostedBy: ev.pubkey, repostEvent: ev, sortTimestamp: ev.created_at });
        continue;
      }
      const targetId = getTargetEventId(ev);
      if (!targetId) continue;
      const resolved = eventsById.get(targetId);
      if (resolved && resolved.created_at <= now) {
        items.push({ event: resolved, repostedBy: ev.pubkey, repostEvent: ev, sortTimestamp: ev.created_at });
      } else {
        queueMissing(targetId, { type: 'repost', event: ev });
      }
    } else if (isReactionKind(ev.kind)) {
      // Kind 7 — reaction. The target is in the last `e` tag (NIP-25).
      const eTags = ev.tags.filter(([n]) => n === 'e');
      const targetId = eTags[eTags.length - 1]?.[1];
      if (!targetId) continue;
      const resolved = eventsById.get(targetId);
      if (resolved && resolved.created_at <= now) {
        items.push({
          event: resolved,
          reactedBy: { event: ev, pubkey: ev.pubkey },
          sortTimestamp: ev.created_at,
        });
      } else {
        queueMissing(targetId, { type: 'reaction', event: ev });
      }
    } else if (isZapKind(ev.kind)) {
      // Kind 9735 Lightning receipt or kind 8333 on-chain attestation.
      const targetId = getTargetEventId(ev);
      const recipientPubkey = ev.tags.find(([n]) => n === 'p')?.[1];
      if (!targetId) {
        // No `e` tag — this is a profile-targeted zap (tipping a person,
        // not a specific note). Surface as a standalone card with the
        // recipient as the target. Without a `p` tag we have nothing
        // to render, so drop it.
        if (!recipientPubkey) continue;
        items.push({
          event: ev,
          profileZapRecipient: recipientPubkey,
          sortTimestamp: ev.created_at,
        });
        continue;
      }
      const senderPubkey = getZapSenderPubkey(ev);
      const sats = getZapAmountSats(ev);
      const resolved = eventsById.get(targetId);
      if (resolved && resolved.created_at <= now) {
        items.push({
          event: resolved,
          zappedBy: { event: ev, pubkey: senderPubkey, sats },
          sortTimestamp: ev.created_at,
        });
      } else {
        // Target note isn't in this page. Queue it for the batched
        // fetch below; if that also fails to resolve the note, the
        // zap falls back to a profile-zap card so the user sees the
        // activity regardless of whether the target note is reachable.
        queueMissing(targetId, { type: 'zap', event: ev, recipientPubkey });
      }
    } else {
      // Direct post — kind 1, 1068, 34236, etc.
      items.push({ event: ev, sortTimestamp: ev.created_at });
    }
  }

  // Single batched fetch for all missing target events.
  if (missingTargets.size > 0) {
    const resolvedIds = new Set<string>();
    try {
      const ids = [...missingTargets.keys()];
      const originals = await nostr.query(
        [{ ids, limit: ids.length }],
        { signal },
      );
      for (const original of originals) {
        if (original.created_at > now) continue;
        const wrappers = missingTargets.get(original.id);
        if (!wrappers) continue;
        resolvedIds.add(original.id);
        for (const w of wrappers) {
          if (w.type === 'repost') {
            items.push({ event: original, repostedBy: w.event.pubkey, repostEvent: w.event, sortTimestamp: w.event.created_at });
          } else if (w.type === 'reaction') {
            items.push({
              event: original,
              reactedBy: { event: w.event, pubkey: w.event.pubkey },
              sortTimestamp: w.event.created_at,
            });
          } else {
            items.push({
              event: original,
              zappedBy: {
                event: w.event,
                pubkey: getZapSenderPubkey(w.event),
                sats: getZapAmountSats(w.event),
              },
              sortTimestamp: w.event.created_at,
            });
          }
        }
      }
    } catch {
      // timeout or abort — fall through to the zap fallback below.
      // Reposts/reactions without a resolvable target are still dropped
      // (there's no meaningful standalone render for them), but zaps
      // can stand on their own as profile-zap cards.
    }

    // Zap fallback: any zap whose target note couldn't be resolved
    // (either because the batched query failed or because the relay
    // doesn't have the note) still surfaces as a standalone profile-zap
    // card. The user sees the zap activity instead of silently losing it.
    for (const [targetId, wrappers] of missingTargets) {
      if (resolvedIds.has(targetId)) continue;
      for (const w of wrappers) {
        if (w.type !== 'zap') continue;
        if (!w.recipientPubkey) continue;
        items.push({
          event: w.event,
          profileZapRecipient: w.recipientPubkey,
          sortTimestamp: w.event.created_at,
        });
      }
    }
  }

  return items;
}

/**
 * Deduplicate FeedItems by event id. Direct posts win over any
 * overlay (repost / reaction / zap), so the user sees the original
 * once with full action buttons rather than as a passive overlay.
 * Returns items sorted newest-first by sortTimestamp.
 */
export function dedupeFeedItems(items: FeedItem[]): FeedItem[] {
  const seen = new Map<string, FeedItem>();
  for (const item of items) {
    const existing = seen.get(item.event.id);
    const isDirect = !item.repostedBy && !item.reactedBy && !item.zappedBy && !item.profileZapRecipient;
    if (!existing) {
      seen.set(item.event.id, item);
    } else if (isDirect && (existing.repostedBy || existing.reactedBy || existing.zappedBy || existing.profileZapRecipient)) {
      seen.set(item.event.id, item);
    }
  }
  return Array.from(seen.values()).sort((a, b) => b.sortTimestamp - a.sortTimestamp);
}

/**
 * Tries to parse the original event from a kind 6 or kind 16 repost's content.
 * Returns undefined if the content is empty or not valid JSON.
 */
export function parseRepostContent(repost: NostrEvent): NostrEvent | undefined {
  if (!repost.content || repost.content.trim() === '') return undefined;
  try {
    const parsed = JSON.parse(repost.content);
    if (parsed && typeof parsed === 'object' && parsed.id && parsed.pubkey && parsed.kind !== undefined) {
      return parsed as NostrEvent;
    }
  } catch {
    // invalid JSON
  }
  return undefined;
}
