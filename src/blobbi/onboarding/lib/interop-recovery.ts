/**
 * Interop recovery for externally-created (e.g. Blobbi Island) Blobbi state
 * events that the strict blobbi-kit display collection wrongly discards.
 *
 * Background
 * ----------
 * `useBlobbisCollection` (from @blobbi-kit/react) keeps only events that satisfy
 * `isValidBlobbiEvent(e) && !isLegacyBlobbiEvent(e)`. `isLegacyBlobbiEvent`
 * returns true for genuinely-unsupported old-app events, but it ALSO returns
 * true via `isUnsupportedLegacyBlobbiEvent` for any event carrying a
 * `client == "blobbi"` or `t == "blobbi"` tag — a heuristic meant to catch the
 * OLD Ditto Blobbi app. Blobbi Island is the new "Blobbi" app and legitimately
 * brands its events that way, so its perfectly-valid kind 31124 Blobbis get
 * misclassified as legacy and dropped — the user sees "Pet Data Not Found"
 * even though the raw event exists and the preflight guard detected ownership.
 *
 * The true source of the bug is that over-broad classification in
 * `@blobbi-kit/core`. Rather than patch/bump the package on this branch, we
 * recover the misclassified events on Ditto's side: an event is a DISPLAYABLE
 * owned Blobbi if it has the fully-formed identity blobbi-kit itself parses
 * (canonical `d`, 64-char `seed`, `name`, valid `stage`) and is NOT a genuine
 * old-app event (no old-app schema tags). Such events are only "legacy" because
 * of the `client`/`t` branding heuristic.
 */

import type { NostrEvent } from '@nostrify/nostrify';
import {
  KIND_BLOBBI_STATE,
  isValidBlobbiEvent,
  isCanonicalBlobbiD,
  parseBlobbiEvent,
  type BlobbiCompanion,
} from '@blobbi-kit/core/blobbi';

/**
 * Old-app schema tags that mark an event as genuinely-unsupported legacy from
 * the previous Ditto Blobbi implementation. Kept in sync with
 * `OLD_APP_SCHEMA_TAG_NAMES` in @blobbi-kit/core. If any of these appear, we do
 * NOT recover the event — it really is old-format.
 */
const OLD_APP_SCHEMA_TAG_NAMES = new Set([
  'incubation_time',
  'incubation_progress',
  'egg_temperature',
  'egg_status',
  'shell_integrity',
  'fees',
  'start_incubation',
  'interact_6_progress',
]);

function getTag(event: NostrEvent, name: string): string | undefined {
  return event.tags.find(([n]) => n === name)?.[1];
}

/** True if the event carries a genuine old-app schema tag (unrecoverable). */
function hasOldAppSchemaTag(event: NostrEvent): boolean {
  return event.tags.some(([name]) => OLD_APP_SCHEMA_TAG_NAMES.has(name));
}

/**
 * Whether a kind 31124 event that blobbi-kit flagged as legacy should still be
 * displayed, because it is a well-formed Blobbi from an interop app (e.g. Blobbi
 * Island) and only tripped the `client`/`t == "blobbi"` branding heuristic.
 *
 * Requirements (all must hold) — deliberately conservative so we never resurrect
 * genuine old-format pets:
 *   - passes blobbi-kit's own `isValidBlobbiEvent` (kind 31124, valid d/b/stage/
 *     state/last_interaction);
 *   - has a canonical d (`blobbi-<pubkeyPrefix12>-<petId10>`);
 *   - has a 64-char `seed` and a `name` (the identity blobbi-kit renders from);
 *   - carries NO old-app schema tags.
 *
 * Empty content and missing Ditto-specific mission/evolution JSON are fine.
 */
export function isDisplayableInteropBlobbi(event: NostrEvent): boolean {
  if (event.kind !== KIND_BLOBBI_STATE) return false;
  if (!isValidBlobbiEvent(event)) return false;
  if (hasOldAppSchemaTag(event)) return false;

  const d = getTag(event, 'd');
  if (!d || !isCanonicalBlobbiD(d)) return false;

  const seed = getTag(event, 'seed');
  if (!seed || seed.length !== 64) return false;

  const name = getTag(event, 'name');
  if (!name) return false;

  return true;
}

/**
 * From a set of authored kind 31124 events, recover the displayable interop
 * Blobbis that the strict collection dropped. Returns parsed companions
 * (newest per d-tag). Only used as a fallback when the strict collection is
 * empty, so the common path is unaffected.
 */
export function recoverInteropCompanions(events: NostrEvent[]): BlobbiCompanion[] {
  const displayable = events.filter(isDisplayableInteropBlobbi);

  // Keep the newest event per d-tag.
  const newestByD = new Map<string, NostrEvent>();
  for (const event of displayable) {
    const d = getTag(event, 'd');
    if (!d) continue;
    const existing = newestByD.get(d);
    if (!existing || event.created_at > existing.created_at) {
      newestByD.set(d, event);
    }
  }

  const companions: BlobbiCompanion[] = [];
  for (const event of newestByD.values()) {
    const parsed = parseBlobbiEvent(event);
    if (parsed) {
      // `parseBlobbiEvent` marks these `isLegacy: true` purely because of the
      // `client`/`t == "blobbi"` branding heuristic. We've already confirmed
      // (via `isDisplayableInteropBlobbi`) they are well-formed, non-old-app
      // Blobbis, so clear the flag — otherwise downstream care actions that
      // early-return on `isLegacy` (sleep toggle, item use, canonical sync)
      // would silently no-op on a perfectly valid Island Blobbi.
      companions.push({ ...parsed, isLegacy: false });
    }
  }

  // Deterministic order by d-tag, matching useBlobbisCollection's sort.
  return companions.sort((a, b) => a.d.localeCompare(b.d));
}
