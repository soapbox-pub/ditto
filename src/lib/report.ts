import type { NostrEvent } from '@nostrify/nostrify';

import { isNostrId, type HexId } from '@/lib/nostrId';
import { sanitizeUrl } from '@/lib/sanitizeUrl';

/**
 * Kind 1984 Report (regular, NIP-56) — a moderation report about a user, an
 * event, or a blob. Reports are subjective signals: anyone can publish one
 * about anyone, so Ditto renders them as claims by their author and never
 * acts on them automatically.
 *
 * At least one of `p` / `e` / `x` must be present. The report type lives in
 * the third element of whichever tag names the target.
 */
export const REPORT_KIND = 1984;

/** Report types defined by NIP-56. */
export const REPORT_TYPES = [
  'nudity',
  'malware',
  'profanity',
  'illegal',
  'spam',
  'impersonation',
  'other',
] as const;

export type ReportType = (typeof REPORT_TYPES)[number];

/** Short display labels for the NIP-56 report types. */
export const REPORT_TYPE_LABELS: Record<ReportType, string> = {
  nudity: 'Nudity',
  malware: 'Malware',
  profanity: 'Hateful speech',
  illegal: 'Illegal content',
  spam: 'Spam',
  impersonation: 'Impersonation',
  other: 'Other',
};

export interface ParsedReport {
  /** Report type, when it's one of the NIP-56 values. */
  type?: ReportType;
  /** The raw report-type string, kept for types outside the NIP-56 list. */
  rawType?: string;
  /** The reported event (`e` tag). */
  event?: { id: HexId; relays?: string[]; authorHint?: HexId };
  /**
   * The reported pubkey (`p` tag). When `event` is also set this is the
   * reported event's author rather than a separately reported user — NIP-56
   * asks reporters to tag both.
   */
  pubkey?: HexId;
  /** The reported blob (`x` tag) and the servers said to host it. */
  blob?: { hash: HexId; servers: string[] };
  /** The reporter's free-form explanation (`content`). */
  reason?: string;
}

/**
 * NIP-10 markers that occupy the same tag position as the report type. Some
 * clients thread reports, and rendering "root" as a report reason would be
 * nonsense.
 */
const NIP10_MARKERS = new Set(['root', 'reply', 'mention']);

function isRelayUrl(value: string | undefined): boolean {
  return typeof value === 'string' && /^wss?:\/\//i.test(value);
}

/**
 * Read the report type out of a target tag's third element, ignoring values
 * that are really relay hints or NIP-10 markers.
 */
function readReportType(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed || isRelayUrl(trimmed) || NIP10_MARKERS.has(trimmed)) return undefined;
  return trimmed;
}

/**
 * Parse a kind 1984 report event.
 *
 * Returns `undefined` when the event names no target at all (`p`, `e`, and
 * `x` all missing or malformed) — a report about nothing has nothing to
 * render.
 *
 * Ids, pubkeys, and blob hashes are hex-validated here, so renderers may pass
 * them straight to `nip19.*Encode` and relay filters. Server URLs are
 * sanitized to HTTPS.
 */
export function parseReport(event: NostrEvent): ParsedReport | undefined {
  if (event.kind !== REPORT_KIND) return undefined;

  const eTag = event.tags.find(([name, value]) => name === 'e' && isNostrId(value));
  const pTag = event.tags.find(([name, value]) => name === 'p' && isNostrId(value));
  const xTag = event.tags.find(([name, value]) => name === 'x' && isNostrId(value));

  if (!eTag && !pTag && !xTag) return undefined;

  const pubkey = pTag && isNostrId(pTag[1]) ? pTag[1] : undefined;

  const rawType = readReportType(eTag?.[2]) ?? readReportType(xTag?.[2]) ?? readReportType(pTag?.[2]);
  const type = REPORT_TYPES.find((t) => t === rawType);

  let reportedEvent: ParsedReport['event'];
  if (eTag && isNostrId(eTag[1])) {
    // NIP-56 puts the report type where NIP-10 puts a relay hint, so only
    // accept the third element when it actually looks like a relay.
    const relay = isRelayUrl(eTag[2]) ? eTag[2] : undefined;
    reportedEvent = {
      id: eTag[1],
      relays: relay ? [relay] : undefined,
      // The `p` tag on an event report names the reported event's author,
      // which doubles as an author hint for resolving the embed.
      authorHint: pubkey,
    };
  }

  let blob: ParsedReport['blob'];
  if (xTag && isNostrId(xTag[1])) {
    const servers = event.tags
      .filter(([name]) => name === 'server')
      .map(([, url]) => sanitizeUrl(url))
      .filter((url): url is string => !!url);
    blob = { hash: xTag[1], servers };
  }

  return {
    type,
    rawType,
    event: reportedEvent,
    pubkey,
    blob,
    reason: event.content.trim() || undefined,
  };
}

/**
 * The noun for what a report targets, used in the feed action header
 * ("reported a post"). Falls back to "post" for reports we can't parse.
 */
export function reportTargetNoun(event: NostrEvent): string {
  const report = parseReport(event);
  if (report?.event) return 'post';
  if (report?.blob) return 'file';
  if (report?.pubkey) return 'user';
  return 'post';
}
