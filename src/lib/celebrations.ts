/**
 * Word-triggered celebration effects for note cards.
 *
 * When a text note's content contains celebratory words or emojis, the feed
 * card plays a small one-shot particle effect the first time it scrolls into
 * view (see `CelebrationOverlay`). Detection is intentionally conservative —
 * a short list of unambiguous triggers — so the effect stays delightful
 * rather than noisy.
 */

export type CelebrationVariant =
  | 'confetti'
  | 'birthday'
  | 'sunrise'
  | 'moonrise'
  | 'sparkle'
  | 'spooky'
  | 'hearts';

// ── Year-round triggers ──

// Checked before confetti — more specific than the generic triggers.
const BIRTHDAY_RE = /\bhappy\s+(?:birthday|bday)\b|🎂|🎈/iu;

const CONFETTI_RE = /\bcongrat(?:s|z|ulations?)?\b|🎉|🎊|🥳/iu;

// Welcome posts — the "welcome to nostr" ritual around newcomers'
// introduction threads.
const SPARKLE_RE = /\bwelcome\s+to\s+(?:nostr|ditto)\b|#introductions?\b/iu;

// The "gm" morning ritual, and its cousin "pv" (pura vida). Anchored to the
// start of the note so ordinary words containing these letters never fire.
// Leading non-word characters (quotes, punctuation) are skipped so that
// verbatim posts like `"GM"` are caught alongside plain `GM`.
const SUNRISE_RE = /^\W*(?:gm|good\s+morning|pv|pura\s+vida)\b/i;

// The "gn" bedtime counterpart, anchored the same way.
const MOONRISE_RE = /^\W*(?:gn|good\s*(?:night|nite)|nighty?\s+night)\b/i;

// ── Seasonal triggers (only active in season) ──

const HALLOWEEN_RE = /\bhappy\s+halloween\b|\bspooky\b|🎃|👻|🦇/iu;

type MonthDay = [month: number, day: number];

/** Inclusive month/day window check, supporting ranges that cross the year
 *  boundary (e.g. Dec 28 – Jan 4). */
function inSeasonalWindow(date: Date, start: MonthDay, end: MonthDay): boolean {
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const onOrAfterStart = m > start[0] || (m === start[0] && d >= start[1]);
  const onOrBeforeEnd = m < end[0] || (m === end[0] && d <= end[1]);
  return start[0] <= end[0]
    ? onOrAfterStart && onOrBeforeEnd
    : onOrAfterStart || onOrBeforeEnd;
}

/**
 * Detect whether note content should trigger a celebration effect.
 * Returns the effect variant, or `undefined` for ordinary content.
 *
 * `now` gates the seasonal variants; callers can omit it. Seasonal checks
 * run first (they're the most specific and time-boxed), then the year-round
 * triggers from most to least specific.
 */
export function detectCelebration(
  content: string,
  now: Date = new Date(),
): CelebrationVariant | undefined {
  if (!content) return undefined;
  // Spooky month — all of October.
  if (inSeasonalWindow(now, [10, 1], [10, 31]) && HALLOWEEN_RE.test(content)) {
    return 'spooky';
  }
  if (BIRTHDAY_RE.test(content)) return 'birthday';
  if (SPARKLE_RE.test(content)) return 'sparkle';
  if (CONFETTI_RE.test(content)) return 'confetti';
  if (SUNRISE_RE.test(content)) return 'sunrise';
  if (MOONRISE_RE.test(content)) return 'moonrise';
  return undefined;
}

// ── Moon phase (gn moonrise) ──

/** Mean length of a lunar cycle, in days. */
const SYNODIC_MONTH_DAYS = 29.530588853;

/** A reference new moon: 2000-01-06 18:14 UTC. */
const REFERENCE_NEW_MOON_MS = Date.UTC(2000, 0, 6, 18, 14);

/**
 * Approximate moon phase at a Unix timestamp (seconds), as a fraction of the
 * lunar cycle: 0 = new, 0.25 = first quarter, 0.5 = full, 0.75 = last
 * quarter. Uses the mean synodic month, which is accurate to within about a
 * day — plenty for drawing the right shape.
 */
export function moonPhase(unixSeconds: number): number {
  const days = (unixSeconds * 1000 - REFERENCE_NEW_MOON_MS) / 86_400_000;
  const cycles = days / SYNODIC_MONTH_DAYS;
  return ((cycles % 1) + 1) % 1;
}

// ── Once-per-session bookkeeping ──

/** Event ids whose celebration has already played this session. Module-level
 *  so the effect fires once per note per app session, surviving feed
 *  re-renders and virtualization unmounts, and shared between the feed and
 *  detail surfaces. */
const celebratedEventIds = new Set<string>();

/** Whether this event's celebration is still eligible to play (once per
 *  event per session). */
export function canCelebrate(id: string): boolean {
  return !celebratedEventIds.has(id);
}

/** Record that this event's celebration has played. */
export function markCelebrated(id: string): void {
  celebratedEventIds.add(id);
}
