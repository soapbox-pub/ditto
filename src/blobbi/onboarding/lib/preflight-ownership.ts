/**
 * Hard preflight ownership guard for the first-hatch publish path.
 *
 * The UI-level ceremony decision (see `decideFirstHatch`) reads from cached
 * TanStack Query state, which can be stale or racy: on a fresh page load the
 * kind 31124 collection query may not have resolved (or a relay hiccup returned
 * empty) at the moment the ceremony mounts and starts creating a new egg. The
 * display collection also queries with a strict `#b` (ecosystem namespace) tag
 * filter — if an externally-created Blobbi (e.g. one minted by Blobbi Island)
 * is stored on a relay that doesn't index/serve that tag, the collection can
 * miss it entirely.
 *
 * This helper is the last line of defense. It runs a FRESH relay query right
 * before publishing a brand-new first Blobbi. It is deliberately MORE robust
 * (more lenient) than the display collection:
 *
 *   - It queries by `{ kinds: [31124], authors: [pubkey] }` WITHOUT the `#b`
 *     filter, so nothing is missed because of a strict indexed-tag requirement.
 *   - Ownership counts any event with a `d` tag and a `stage` of egg / baby /
 *     adult — "valid enough to parse as Blobbi state". It does NOT require the
 *     Ditto/ecosystem `b` namespace tag, Ditto-specific content JSON, mission /
 *     evolution / streak seed data, or a prior egg event.
 *
 * If any such event is found, the caller MUST abort the new hatch and reuse the
 * existing Blobbi instead.
 */

import type { NostrEvent, NPool } from '@nostrify/nostrify';
import {
  KIND_BLOBBI_STATE,
  parseBlobbiEvent,
  type BlobbiCompanion,
} from '@blobbi-kit/core/blobbi';

const OWNED_STAGES = new Set(['egg', 'baby', 'adult']);

function getTag(event: NostrEvent, name: string): string | undefined {
  return event.tags.find(([n]) => n === name)?.[1];
}

/**
 * A minimal, lenient "is this event a Blobbi the user owns" check.
 *
 * Intentionally looser than `isValidBlobbiEvent` from blobbi-kit (which also
 * requires the exact `b === "blobbi:ecosystem:v1"` namespace, a `state` tag,
 * and a `last_interaction` tag). For the ownership guard we only need enough to
 * be confident the user already has a Blobbi so we don't mint a duplicate.
 */
export function isOwnedBlobbiStateEvent(event: NostrEvent): boolean {
  if (event.kind !== KIND_BLOBBI_STATE) return false;
  const d = getTag(event, 'd');
  if (!d) return false;
  const stage = getTag(event, 'stage');
  if (!stage || !OWNED_STAGES.has(stage)) return false;
  return true;
}

export interface PreflightOwnership {
  /** True if the user already owns at least one valid kind 31124 Blobbi. */
  hasBlobbi: boolean;
  /**
   * The best existing Blobbi to reuse/select, if one could be parsed. Prefers a
   * hatched (baby/adult) Blobbi, then an egg. May be undefined even when
   * `hasBlobbi` is true if the event couldn't be fully parsed by blobbi-kit
   * (e.g. missing a tag the strict parser requires) — the guard still reports
   * ownership so we never mint a duplicate.
   */
  existing?: BlobbiCompanion;
  /** Raw count of kind 31124 events returned for the author (for debugging). */
  rawCount: number;
  /** Number of events that passed the lenient ownership check. */
  ownedCount: number;
}

const STAGE_RANK: Record<string, number> = { adult: 3, baby: 2, egg: 1 };

/**
 * Query relays fresh for authored kind 31124 events and decide whether the user
 * already owns a Blobbi. Never throws for query problems — on error it reports
 * `hasBlobbi: false` so the caller falls back to its normal flow (the UI-level
 * decision remains as a secondary guard).
 *
 * The strict-first, lenient-fallback strategy: we first ask for events tagged
 * with the ecosystem namespace, and if that returns nothing we retry WITHOUT
 * the `#b` filter so we still catch externally-created Blobbis.
 */
export async function preflightBlobbiOwnership(
  nostr: NPool,
  pubkey: string,
  opts: { signal?: AbortSignal } = {},
): Promise<PreflightOwnership> {
  const empty: PreflightOwnership = { hasBlobbi: false, rawCount: 0, ownedCount: 0 };
  if (!pubkey) return empty;

  const timeout = AbortSignal.timeout(10_000);
  const signal = opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout;

  let events: NostrEvent[] = [];
  try {
    // Query WITHOUT the `#b` ecosystem tag filter so a strict indexed-tag
    // requirement can never hide an externally-created Blobbi.
    events = await nostr.query(
      [{ kinds: [KIND_BLOBBI_STATE], authors: [pubkey] }],
      { signal },
    );
  } catch (err) {
    console.error('[preflightBlobbiOwnership] query failed:', err);
    return empty;
  }

  const owned = events.filter(isOwnedBlobbiStateEvent);

  if (owned.length === 0) {
    return { hasBlobbi: false, rawCount: events.length, ownedCount: 0 };
  }

  // Pick the best existing Blobbi to reuse: highest stage rank, then newest.
  const sorted = [...owned].sort((a, b) => {
    const rankA = STAGE_RANK[getTag(a, 'stage') ?? ''] ?? 0;
    const rankB = STAGE_RANK[getTag(b, 'stage') ?? ''] ?? 0;
    if (rankA !== rankB) return rankB - rankA;
    return b.created_at - a.created_at;
  });

  let existing: BlobbiCompanion | undefined;
  for (const event of sorted) {
    const parsed = parseBlobbiEvent(event);
    if (parsed) {
      existing = parsed;
      break;
    }
  }

  return {
    hasBlobbi: true,
    existing,
    rawCount: events.length,
    ownedCount: owned.length,
  };
}
