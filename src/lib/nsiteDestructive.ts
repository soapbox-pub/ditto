/**
 * Detects events an nsite asks to sign that would wipe or lock in the user's
 * own data: emptying the profile or a list, deleting lists or many events,
 * a request to vanish, or a replaceable event dated in the future (it would
 * win over every later edit until that date).
 *
 * A remembered grant for a kind doesn't cover these — the user is warned and
 * asked every time.
 */
import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';

/** Why an event is destructive. */
export type NsiteDestructiveWarning =
  | { type: 'vanish' }
  | { type: 'futureDated' }
  | { type: 'profile'; fields: string[] }
  | { type: 'list'; kind: number; removed: number; total: number }
  | { type: 'privateList'; kind: number }
  | { type: 'deleteLists' }
  | { type: 'deleteMany'; count: number };

/** The event template as it will be signed. */
export interface NsiteEventTemplate {
  kind: number;
  content: string;
  tags: unknown;
  created_at: number;
}

/** NIP-51 sets, which are lists kept under a `d` tag. */
const LIST_SET_KINDS = new Set([30000, 30002, 30003, 30004, 30005, 30007, 30015, 30030, 30063, 30267, 39089, 39092]);

/** Tags that describe a list rather than being entries in it. */
const LIST_META_TAGS = new Set(['d', 'title', 'name', 'description', 'summary', 'image', 'thumb', 'alt', 'client', 'published_at', 'expiration']);

/** Entries a single change may remove before it counts as wiping the list. */
const MAX_REMOVED_ENTRIES = 2;

/** Events a single deletion may target before it counts as a mass deletion. */
const MAX_DELETED_EVENTS = 4;

/** How far ahead of now `created_at` may be, for clock skew. */
const MAX_FUTURE_SECONDS = 10 * 60;

const VANISH_KIND = 62;

/** Kinds whose latest event is the user's profile or one of their lists. */
function isProtectedKind(kind: number): boolean {
  return kind === 0 || kind === 3 || (kind >= 10000 && kind < 20000) || LIST_SET_KINDS.has(kind);
}

function isReplaceableKind(kind: number): boolean {
  return kind === 0 || kind === 3 || (kind >= 10000 && kind < 20000) || (kind >= 30000 && kind < 40000);
}

function stringTags(tags: unknown): string[][] {
  if (!Array.isArray(tags)) return [];
  return tags.filter((t): t is string[] => Array.isArray(t) && t.every((v) => typeof v === 'string'));
}

function getDTag(tags: unknown): string {
  return stringTags(tags).find(([n]) => n === 'd')?.[1] ?? '';
}

/** Event ids a kind 5 deletion targets. */
function deletionIds(tags: unknown): string[] {
  return stringTags(tags).flatMap(([n, v]) => (n === 'e' && v ? [v] : []));
}

/**
 * What to look up before judging `template`: the user's current copy of a
 * profile or list, or the events a small deletion targets. Null if nothing.
 */
export function destructiveLookupFilter(template: NsiteEventTemplate, pubkey: string): NostrFilter | null {
  const { kind } = template;
  if (kind === 5) {
    const ids = deletionIds(template.tags);
    if (ids.length === 0 || ids.length > MAX_DELETED_EVENTS) return null;
    return { ids, authors: [pubkey], limit: ids.length };
  }
  if (!isProtectedKind(kind)) return null;
  if (kind >= 30000) return { kinds: [kind], authors: [pubkey], '#d': [getDTag(template.tags)] };
  return { kinds: [kind], authors: [pubkey] };
}

function listEntries(tags: unknown): Set<string> {
  return new Set(
    stringTags(tags)
      .filter(([n]) => !LIST_META_TAGS.has(n))
      .map((t) => JSON.stringify(t.slice(0, 2))),
  );
}

function profileFields(content: string): Map<string, string> {
  try {
    const parsed: unknown = JSON.parse(content);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return new Map();
    return new Map(
      Object.entries(parsed).filter((e): e is [string, string] => typeof e[1] === 'string' && e[1].trim() !== ''),
    );
  } catch {
    return new Map();
  }
}

/**
 * Judge whether signing `template` would destroy the user's data.
 *
 * @param found The result of `destructiveLookupFilter`: the current profile or
 *   list (newest first), or the events a deletion targets.
 * @param now Current time in seconds.
 */
export function detectDestructiveEvent(
  template: NsiteEventTemplate,
  found: NostrEvent[],
  now: number,
): NsiteDestructiveWarning | null {
  const { kind } = template;

  if (kind === VANISH_KIND) return { type: 'vanish' };

  if (isReplaceableKind(kind) && template.created_at > now + MAX_FUTURE_SECONDS) {
    return { type: 'futureDated' };
  }

  if (kind === 5) {
    const tags = stringTags(template.tags);
    const ids = deletionIds(tags);
    const coords = tags.flatMap(([n, v]) => (n === 'a' && v ? [v] : []));
    const kinds = tags.flatMap(([n, v]) => (n === 'k' ? [Number(v)] : []));

    const hitsList = coords.some((c) => isProtectedKind(Number(c.split(':')[0])))
      || kinds.some(isProtectedKind)
      || found.some((e) => ids.includes(e.id) && isProtectedKind(e.kind));
    if (hitsList) return { type: 'deleteLists' };

    const count = ids.length + coords.length;
    if (count > MAX_DELETED_EVENTS) return { type: 'deleteMany', count };
    return null;
  }

  if (!isProtectedKind(kind)) return null;

  const prev = found
    .filter((e) => e.kind === kind)
    .sort((a, b) => b.created_at - a.created_at)[0];
  if (!prev) return null;

  if (kind === 0) {
    const next = profileFields(template.content);
    const cleared = [...profileFields(prev.content).keys()].filter((k) => !next.has(k));
    return cleared.length >= 2 ? { type: 'profile', fields: cleared } : null;
  }

  const before = listEntries(prev.tags);
  const after = listEntries(template.tags);
  const removed = [...before].filter((e) => !after.has(e)).length;
  if (removed > MAX_REMOVED_ENTRIES) {
    return { type: 'list', kind, removed, total: before.size };
  }

  // Kind 3 content is a legacy relay map, not private entries.
  if (kind !== 3 && prev.content.trim() && !template.content.trim()) {
    return { type: 'privateList', kind };
  }

  return null;
}
