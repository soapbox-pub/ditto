import type { NostrEvent } from '@nostrify/nostrify';
import { isNostrId } from '@/lib/nostrId';
import { tryNaddrEncode } from '@/lib/safeNip19';

/** NIP-34 status event kinds: Open, Applied/Merged/Resolved, Closed, Draft. */
export const GIT_STATUS_KINDS = [1630, 1631, 1632, 1633] as const;

/**
 * All NIP-34 git kinds: repo announcements (30617), repo state / pushes
 * (30618), patches (1617), pull requests (1618), PR updates (1619),
 * issues (1621), and status events (1630-1633).
 */
export const GIT_ACTIVITY_KINDS: number[] = [30617, 30618, 1617, 1618, 1619, 1621, ...GIT_STATUS_KINDS];

/** NIP-34 kinds the compact `EmbeddedGitCard` can render when quoted via nevent. */
export const EMBEDDED_GIT_KINDS = new Set([1617, 1618, 1619, 1621, 1630, 1631, 1632, 1633]);

/** A reference to a kind 30617 repository announcement parsed from an `a` tag. */
export interface GitRepoRef {
  /** Repository owner pubkey (validated 64-char hex). */
  pubkey: string;
  /** The repository's `d` tag identifier. */
  identifier: string;
  /** Optional relay hint from the `a` tag. */
  relay?: string;
}

/**
 * Extract the repository reference from a NIP-34 event's `a` tag
 * (`30617:<pubkey>:<repo-id>`). Returns undefined when the tag is missing
 * or malformed; the pubkey is validated so callers can safely pass it to
 * NIP-19 encoders and filter `authors` arrays.
 */
export function getGitRepoRef(event: NostrEvent): GitRepoRef | undefined {
  for (const [name, value, relay] of event.tags) {
    if (name !== 'a' || !value?.startsWith('30617:')) continue;
    const parts = value.split(':');
    if (parts.length < 3) continue;
    const pubkey = parts[1];
    if (!isNostrId(pubkey)) continue;
    // The d-tag identifier may itself contain colons.
    const identifier = parts.slice(2).join(':');
    return { pubkey, identifier, relay: relay || undefined };
  }
  return undefined;
}

/**
 * Encode a repository reference as a kind 30617 naddr for linking to the
 * repo announcement (internally or on external NIP-34 sites).
 */
export function gitRepoNaddr(ref: GitRepoRef | undefined): string | undefined {
  if (!ref) return undefined;
  return tryNaddrEncode({
    kind: 30617,
    pubkey: ref.pubkey,
    identifier: ref.identifier,
    relays: ref.relay ? [ref.relay] : undefined,
  });
}

/** A validated reference to another event via an `e`/`E` tag. */
export interface GitEventRef {
  id: string;
  relay?: string;
}

/**
 * Extract the root ticket (issue / patch / PR) reference from a NIP-34
 * status event (1630-1633) or PR update (1619). Prefers the NIP-22 `E`
 * tag, then the `e` tag with a `root` marker, then the first plain `e`.
 */
export function getGitRootRef(event: NostrEvent): GitEventRef | undefined {
  let fallback: GitEventRef | undefined;
  for (const [name, value, relay, marker] of event.tags) {
    if ((name !== 'e' && name !== 'E') || !isNostrId(value)) continue;
    const ref = { id: value, relay: relay || undefined };
    if (name === 'E' || marker === 'root') return ref;
    fallback ??= ref;
  }
  return fallback;
}

/**
 * Noun for a git ticket kind. Used to disambiguate kind 1631, which means
 * "Resolved" for issues but "Applied" for patches and "Merged" for PRs.
 * Returns undefined when the root event kind is unknown so callers can
 * omit the noun instead of guessing.
 */
export function gitTicketNoun(kind: number | undefined): string | undefined {
  switch (kind) {
    case 1617: return 'patch';
    case 1618: return 'pull request';
    case 1621: return 'issue';
    default: return undefined;
  }
}

/**
 * Past-tense verb (or status label) for a NIP-34 status event,
 * disambiguated by the root ticket's kind per NIP-34: 1631 is "Resolved"
 * for issues, "Applied" for patches, and "Merged" for pull requests.
 * Kind 1633 yields "draft" ("Draft pull request <subject>").
 */
export function gitStatusVerb(statusKind: number, rootKind?: number): string {
  switch (statusKind) {
    case 1630: return 'reopened';
    case 1631:
      switch (rootKind) {
        case 1617: return 'applied';
        case 1618: return 'merged';
        default: return 'resolved';
      }
    case 1632: return 'closed';
    case 1633: return 'draft';
    default: return 'updated';
  }
}

/**
 * Human-readable subject for a git ticket (issue / patch / PR).
 * Prefers the `subject` tag; for patches, parses the `Subject:` header
 * from the `git format-patch` content; otherwise falls back to the first
 * non-empty content line.
 */
export function getGitTicketSubject(event: NostrEvent): string | undefined {
  const subject = event.tags.find(([n]) => n === 'subject')?.[1]?.trim();
  if (subject) return subject;

  const lines = event.content.split('\n');
  if (event.kind === 1617) {
    // git format-patch: find the "Subject:" header and strip "[PATCH ...]".
    const header = lines.slice(0, 20).find((l) => l.startsWith('Subject:'));
    if (header) {
      const parsed = header.replace(/^Subject:\s*(\[PATCH[^\]]*\])?\s*/, '').trim();
      if (parsed) return parsed;
    }
  }

  const firstLine = lines.find((l) => {
    const t = l.trim();
    // Skip blank lines and leading markdown images (issue bots often start
    // the body with a header image) — neither makes a usable title.
    return t.length > 0 && !t.startsWith('![');
  })?.trim();
  return firstLine || undefined;
}
