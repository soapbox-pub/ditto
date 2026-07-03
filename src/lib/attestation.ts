import type { NostrEvent } from '@nostrify/nostrify';

import { isNostrId } from '@/lib/nostrId';
import { parseAddr, type ParsedAddr } from '@/lib/parseAddr';

/**
 * Kind 31871 Attestation (addressable) — a truthfulness claim about another
 * Nostr event (the "Assertion Event"), signed by an "Attestor".
 *
 * Spec: "Attestations" draft NIP. Required tags: `d`, exactly one of
 * `e`/`a` (the assertion event), and `s` (state). Optional: `valid_from`,
 * `valid_to`, `expiration`, `request`. `content` is an optional
 * human-readable description.
 */
export const ATTESTATION_KIND = 31871;

/** The lifecycle states an attestation can be in (`s` tag). */
export const ATTESTATION_STATES = ['verifying', 'valid', 'invalid', 'revoked'] as const;

export type AttestationState = (typeof ATTESTATION_STATES)[number];

/** The assertion event an attestation points at, via `e` or `a` tag. */
export type AttestationTarget =
  | { type: 'event'; id: string; relays?: string[]; authorHint?: string }
  | { type: 'addr'; addr: ParsedAddr; relays?: string[] };

export interface ParsedAttestation {
  /** Lifecycle state from the `s` tag. */
  state: AttestationState;
  /** The assertion event being attested to (`e` or `a` tag), if resolvable. */
  target?: AttestationTarget;
  /** Unix seconds (inclusive) the attestation is valid from. */
  validFrom?: number;
  /** Unix seconds (inclusive) the attestation is valid until. */
  validTo?: number;
  /** Optional human-readable description from `content`. */
  description?: string;
}

function parseTimestamp(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : undefined;
}

/** Format a unix-seconds timestamp as a short local date. */
function formatDate(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/** Human-readable validity window from optional `valid_from` / `valid_to`. */
export function attestationValidityText(validFrom?: number, validTo?: number): string | undefined {
  if (validFrom !== undefined && validTo !== undefined) {
    return `Valid ${formatDate(validFrom)} – ${formatDate(validTo)}`;
  }
  if (validFrom !== undefined) return `Valid from ${formatDate(validFrom)}`;
  if (validTo !== undefined) return `Valid until ${formatDate(validTo)}`;
  return undefined;
}

/**
 * Parse a kind 31871 Attestation event.
 *
 * Returns `undefined` when the required `s` tag is missing or holds an
 * unknown state — there is nothing trustworthy to render. A missing or
 * malformed `e`/`a` target still parses (state alone is meaningful for
 * revocations, which per the spec may omit the target).
 *
 * Validity is established at the parse layer: event ids and coordinate
 * pubkeys are hex-validated, so renderers may pass them straight to
 * `nip19.neventEncode` / `nip19.naddrEncode`.
 */
export function parseAttestation(event: NostrEvent): ParsedAttestation | undefined {
  if (event.kind !== ATTESTATION_KIND) return undefined;

  const stateTag = event.tags.find(([n]) => n === 's')?.[1]?.trim().toLowerCase();
  const state = ATTESTATION_STATES.find((s) => s === stateTag);
  if (!state) return undefined;

  // Exactly one of `e` / `a` should be present; prefer `a` when both appear
  // (mirrors HighlightContent's source precedence for addressable events).
  let target: AttestationTarget | undefined;

  const aTag = event.tags.find(([n, v]) => n === 'a' && v);
  if (aTag) {
    const addr = parseAddr(aTag[1]);
    if (addr) {
      target = { type: 'addr', addr, relays: aTag[2] ? [aTag[2]] : undefined };
    }
  }

  if (!target) {
    const eTag = event.tags.find(([n, v]) => n === 'e' && v);
    if (eTag && isNostrId(eTag[1])) {
      target = {
        type: 'event',
        id: eTag[1],
        relays: eTag[2] ? [eTag[2]] : undefined,
        authorHint: isNostrId(eTag[3]) ? eTag[3] : undefined,
      };
    }
  }

  return {
    state,
    target,
    validFrom: parseTimestamp(event.tags.find(([n]) => n === 'valid_from')?.[1]),
    validTo: parseTimestamp(event.tags.find(([n]) => n === 'valid_to')?.[1]),
    description: event.content.trim() || undefined,
  };
}
