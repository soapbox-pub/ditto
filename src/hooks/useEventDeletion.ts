import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';
import type { AddrCoords } from '@/hooks/useEvent';

/** Target of a deletion lookup — mirrors the two ways an event can be addressed. */
export type DeletionTarget =
  | { type: 'event'; eventId: string; authorHint?: string }
  | { type: 'addr'; addr: AddrCoords };

export interface EventDeletionInfo {
  /** The kind 5 deletion request event. */
  deletion: NostrEvent;
  /** Kind of the deleted event, from the deletion request's `k` tag (if unambiguous). */
  deletedKind?: number;
  /** Optional author-supplied reason (the deletion request's `content`). */
  reason?: string;
  /**
   * Whether the deletion request's author is known to match the deleted
   * event's author (NIP-09 validity). True when we have the author's pubkey
   * (naddr, or nevent with an author hint) and filtered by it; false when the
   * lookup ran without an author filter (bare note1/hex id), in which case the
   * deletion is a *claim* — anyone can publish a kind 5 referencing any id.
   */
  verified: boolean;
}

/**
 * Checks whether a kind 5 (NIP-09) deletion request exists for an event that
 * failed to load. Intended for "event not found" states: a missing event plus
 * a matching deletion request strongly suggests the author deleted it.
 *
 * When the target's author pubkey is known, the query is filtered by
 * `authors` so only a valid (self-authored) deletion request matches.
 */
export function useEventDeletion(target: DeletionTarget | undefined, enabled: boolean) {
  const { nostr } = useNostr();

  return useQuery<EventDeletionInfo | null>({
    queryKey: [
      'event-deletion',
      target?.type === 'event'
        ? { id: target.eventId, author: target.authorHint ?? '' }
        : target
          ? { kind: target.addr.kind, pubkey: target.addr.pubkey, d: target.addr.identifier }
          : null,
    ],
    queryFn: async (c) => {
      if (!target) return null;

      let filter: NostrFilter;
      let verified: boolean;

      if (target.type === 'event') {
        filter = { kinds: [5], '#e': [target.eventId], limit: 10 };
        verified = !!target.authorHint;
        if (target.authorHint) {
          filter.authors = [target.authorHint];
        }
      } else {
        // NIP-09 `a`-tag coordinate: kind:pubkey:identifier (identifier empty
        // for non-addressable replaceable kinds). Only the author's own kind 5
        // is a valid deletion for an addressable event.
        const coord = `${target.addr.kind}:${target.addr.pubkey}:${target.addr.identifier}`;
        filter = { kinds: [5], authors: [target.addr.pubkey], '#a': [coord], limit: 10 };
        verified = true;
      }

      const signal = AbortSignal.any([c.signal, AbortSignal.timeout(5000)]);
      const events = await nostr.query([filter], { signal });
      if (events.length === 0) return null;

      // Earliest deletion request = when the author first deleted it.
      const deletion = [...events].sort((a, b) => a.created_at - b.created_at)[0];

      // Best-effort kind extraction: only trust the `k` tag when unambiguous
      // (a single kind 5 may reference many events of different kinds).
      let deletedKind: number | undefined;
      if (target.type === 'addr') {
        deletedKind = target.addr.kind;
      } else {
        const kTags = new Set(deletion.tags.filter(([n]) => n === 'k').map(([, v]) => v));
        if (kTags.size === 1) {
          const parsed = Number([...kTags][0]);
          if (Number.isInteger(parsed) && parsed >= 0) deletedKind = parsed;
        }
      }

      const reason = deletion.content.trim() || undefined;

      return { deletion, deletedKind, reason, verified };
    },
    enabled: enabled && !!target,
    staleTime: 5 * 60 * 1000,
  });
}
