import type { NostrEvent } from '@nostrify/nostrify';

/**
 * Mention-swarm detection for a notification inbox — a DISPLAY heuristic only,
 * and a sibling of `replyFlood.ts` rather than a replacement for it.
 *
 * The two modules answer the same question about opposite campaigns. Reply
 * flood catches ECHO: one pitch repeated across many throwaway keys. This
 * catches the shape that is engineered to defeat exactly that — a mad-libs
 * generator that emits a UNIQUE message every time, so no two copies resemble
 * each other and no content rule can group them. Observed live against this
 * app's own inbox: 36 notes, 35 distinct normalized shapes, median pairwise
 * Jaccard 0.069, one pair of 630 clearing the 0.6 similarity bar. Content
 * clustering had nothing to hold.
 *
 * What the campaign could not disguise is who it was aimed at and how fast it
 * arrived. Every note tagged the same small victim set, one note per pubkey,
 * 36 pubkeys in 51 seconds. So this rule reads the envelope, not the message:
 *
 *  - COHORT: notifications are grouped by each OTHER pubkey they `p` tag. Two
 *    strangers naming the same third party are being sprayed by one campaign;
 *    "who else got hit" is the one field a per-message generator has to hold
 *    constant to deliver its payload to a list.
 *  - ONE-SHOT: a swarm is one note per throwaway key. A real group thread has
 *    people talking more than once, so {@link SWARM_MIN_ONE_SHOT} separates a
 *    crowd of burner keys from a conversation among a few.
 *  - BURST: the group's mean inter-arrival must be under
 *    {@link SWARM_MAX_MEAN_GAP}. This is the rule that actually does the work.
 *    Measured on a real inbox, flagged cohorts sat at 1.2-2.0s while the
 *    tightest genuine cohort sat at 818s — a ~400x margin. The author count and
 *    one-shot gates alone would fold real group threads, several of which had
 *    seven distinct authors each posting once.
 *
 * A thread could not use any of this, which is why `replyFlood.ts` dropped the
 * cohort and arrival rules when it was ported: a reply batch has a fixed root,
 * so every reply shares a "cohort" trivially and arrival says only how popular
 * the note is. An inbox is the batch where these mean something.
 *
 * Known limits, stated plainly:
 *
 *  - `created_at` is attacker-controlled. Spreading a campaign over hours
 *    defeats the burst gate. (Stamping every note with the SAME time does not —
 *    that is a mean gap of zero.) This raises the cost of a flood; it does not
 *    make one impossible.
 *  - A swarm that tags ONLY the reader has no cohort to group by and is not
 *    detected. That is deliberate. The cohort requirement is the only thing
 *    separating "a campaign spraying a fixed victim list" from "a stranger's
 *    post went viral and thirty people replied to you" — and the reader wants
 *    to see the second one.
 *
 * Like reply flood, this is NOT a moderation boundary. Nothing is dropped, and
 * the same two invariants hold: never flag the reader's own event, never flag
 * an event from someone they follow. Both are enforced by excluding those
 * events from the batch UP FRONT, so a follow joining a conversation can
 * neither be folded nor count toward a swarm forming.
 */

/** Distinct pubkeys a cohort must span before it reads as a swarm. */
export const SWARM_MIN_AUTHORS = 5;
/**
 * Ratio of distinct authors to events a cohort must hold. At 1.0 every author
 * posted exactly once — a crowd of burner keys. A conversation among a few
 * people repeating themselves sits far below this (a real 14-event group thread
 * measured 0.29).
 */
export const SWARM_MIN_ONE_SHOT = 0.8;
/**
 * Seconds of mean inter-arrival, at or under which a cohort reads as a burst
 * rather than a discussion. Deliberately far tighter than any human cohort
 * observed: real group threads unfold over minutes to hours (818s at the very
 * tightest), while a generator-driven swarm lands at one note per second or two.
 */
export const SWARM_MAX_MEAN_GAP = 10;
/**
 * Most co-tagged pubkeys read from one event. A note blasting hundreds of `p`
 * tags would otherwise join hundreds of groups, and the whole batch is walked
 * per group. Purely a work bound: a blast wide enough to be truncated still
 * groups with its siblings through the victims they share, because the subset
 * is chosen by sorted order rather than tag order and so is stable across
 * copies of the same list.
 */
const MAX_COHORT_TAGS = 32;

export interface MentionSwarmOptions {
  /**
   * The reading user's pubkey. Their own events are never flagged, and they are
   * excluded as a cohort key — every notification tags the reader by
   * definition, so keying on them would put the whole inbox in one group.
   */
  self?: string;
  /** Pubkeys the reader follows. Their events are never flagged. */
  follows?: ReadonlySet<string>;
}

/** One co-tagged victim and every candidate notification naming them. */
interface Cohort {
  ids: string[];
  authors: Set<string>;
  times: number[];
}

/**
 * The co-tagged pubkeys of one event, deduped, minus the reader, bounded.
 */
function cohortKeys(event: NostrEvent, self: string | undefined): string[] {
  const keys = new Set<string>();
  for (const [name, value] of event.tags) {
    if (name !== 'p' || !value || value === self) continue;
    keys.add(value);
  }
  if (keys.size <= MAX_COHORT_TAGS) return [...keys];
  return [...keys].sort().slice(0, MAX_COHORT_TAGS);
}

/** Mean seconds between arrivals in a cohort. Infinity for a single event. */
function meanGap(times: number[]): number {
  if (times.length < 2) return Infinity;
  const sorted = [...times].sort((a, b) => a - b);
  return (sorted[sorted.length - 1] - sorted[0]) / (sorted.length - 1);
}

/**
 * The ids of notifications belonging to a mention swarm. Pure and batch-local:
 * it reads only the events passed in, so it needs no store, roster, or network.
 * Pass the whole loaded notification batch — a swarm is a property of the crowd
 * and its timing, which a per-event predicate cannot see.
 */
export function mentionSwarmIds(
  events: readonly NostrEvent[],
  opts: MentionSwarmOptions = {},
): Set<string> {
  const flagged = new Set<string>();
  if (events.length < SWARM_MIN_AUTHORS) return flagged;

  const { self, follows } = opts;

  const cohorts = new Map<string, Cohort>();
  for (const event of events) {
    // Trust exemption, applied FIRST so a follow (or the reader) can neither be
    // folded nor push a cohort over the author bar. This is what defeats the
    // seed-the-swarm-with-a-regular attack, and it is why the exemption runs
    // here rather than as a final sweep the way reply flood does it.
    if (event.pubkey === self || follows?.has(event.pubkey)) continue;

    for (const key of cohortKeys(event, self)) {
      let cohort = cohorts.get(key);
      if (!cohort) cohorts.set(key, (cohort = { ids: [], authors: new Set(), times: [] }));
      cohort.ids.push(event.id);
      cohort.authors.add(event.pubkey);
      cohort.times.push(event.created_at);
    }
  }

  for (const cohort of cohorts.values()) {
    if (cohort.authors.size < SWARM_MIN_AUTHORS) continue;
    if (cohort.authors.size / cohort.ids.length < SWARM_MIN_ONE_SHOT) continue;
    if (meanGap(cohort.times) > SWARM_MAX_MEAN_GAP) continue;
    for (const id of cohort.ids) flagged.add(id);
  }

  return flagged;
}
