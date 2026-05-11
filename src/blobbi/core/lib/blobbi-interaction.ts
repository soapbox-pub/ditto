/**
 * Blobbi Interaction Event (Kind 1124)
 *
 * Immutable interaction log events targeting a canonical Blobbi (kind 31124).
 * These events do NOT directly mutate canonical state. They form an append-only
 * log that can later be projected for social status or consolidated by the owner.
 *
 * Required tags:
 *   ["a", "31124:<owner-pubkey>:<blobbi-d-tag>"]
 *   ["p", "<owner-pubkey>"]
 *   ["action", "<action>"]
 *   ["source", "<source>"]
 *
 * Optional tags:
 *   ["blobbi", "<short-id>"]
 *   ["item", "<item-id>"]
 *   ["client", "<client-id>"]  — added automatically by useNostrPublish
 *
 * @module blobbi-interaction
 */

import type { NostrEvent } from '@nostrify/nostrify';

import type { BlobbiCompanion } from './blobbi';

// ─── Constants ────────────────────────────────────────────────────────────────

export const KIND_BLOBBI_INTERACTION = 1124;

// ─── V1 Action Types ──────────────────────────────────────────────────────────

/**
 * V1 interaction actions.
 *
 * `pet` is intentionally deferred from V1 — it does not map to any current
 * owner flow and will be introduced in a later slice.
 */
export const INTERACTION_ACTIONS = ['feed', 'play', 'clean', 'medicate', 'boost'] as const;
export type InteractionAction = typeof INTERACTION_ACTIONS[number];

/**
 * Mapping from internal codebase action names to kind 1124 spec action names.
 *
 * | Internal        | 1124 action |
 * |-----------------|-------------|
 * | feed            | feed        |
 * | play            | play        |
 * | clean           | clean       |
 * | medicine        | medicate    |
 * | boost           | boost       |
 * | play_music      | play        |
 * | sing            | play        |
 *
 * Returns `undefined` for actions that should NOT emit a 1124 event (e.g.
 * sleep toggle, streak bookkeeping).
 */
export const INTERNAL_TO_INTERACTION_ACTION: Record<string, InteractionAction | undefined> = {
  feed: 'feed',
  play: 'play',
  clean: 'clean',
  medicine: 'medicate',
  boost: 'boost',
  play_music: 'play',
  sing: 'play',
};

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Parsed representation of a kind 1124 Blobbi Interaction event.
 */
export interface BlobbiInteraction {
  /** Original event */
  event: NostrEvent;
  /** The `a` tag coordinate (e.g. "31124:<owner>:<d>") */
  blobbiCoordinate: string;
  /** Owner pubkey from the `p` tag */
  ownerPubkey: string;
  /** V1 action name */
  action: InteractionAction;
  /** UI origin source */
  source: string;
  /** Short Blobbi ID from `blobbi` tag (optional) */
  blobbiShortId: string | undefined;
  /** Item used from `item` tag (optional) */
  itemId: string | undefined;
  /** Author pubkey of the interaction event */
  authorPubkey: string;
  /** Event created_at timestamp (unix seconds) */
  createdAt: number;
}

/**
 * Parameters needed to build a 1124 event template.
 */
export interface InteractionEventParams {
  /** Pubkey of the Blobbi owner */
  ownerPubkey: string;
  /** The d-tag of the target Blobbi (kind 31124) */
  blobbiDTag: string;
  /** The interaction action */
  action: InteractionAction;
  /** UI surface that originated this interaction */
  source: string;
  /** Item ID used, if applicable */
  itemId?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Extract the short Blobbi ID (10-hex petId) from a canonical d-tag.
 * Returns `undefined` for non-canonical d-tags.
 *
 * Canonical format: `blobbi-{12 hex}-{10 hex}`
 */
export function extractBlobbiShortId(dTag: string): string | undefined {
  const match = dTag.match(/^blobbi-[0-9a-f]{12}-([0-9a-f]{10})$/);
  return match?.[1];
}

// ─── Builder ──────────────────────────────────────────────────────────────────

/**
 * Build a kind 1124 event template ready for signing/publishing.
 *
 * The returned object can be passed directly to `useNostrPublish`'s
 * `publishEvent()`. The `client` tag is added automatically by the hook.
 */
export function buildInteractionEventTemplate(params: InteractionEventParams): {
  kind: number;
  content: string;
  tags: string[][];
} {
  const coordinate = `31124:${params.ownerPubkey}:${params.blobbiDTag}`;

  const tags: string[][] = [
    ['a', coordinate],
    ['p', params.ownerPubkey],
    ['action', params.action],
    ['source', params.source],
  ];

  const shortId = extractBlobbiShortId(params.blobbiDTag);
  if (shortId) {
    tags.push(['blobbi', shortId]);
  }

  if (params.itemId) {
    tags.push(['item', params.itemId]);
  }

  // NIP-31 alt tag for human-readable description
  tags.push(['alt', `Blobbi interaction: ${params.action}`]);

  return {
    kind: KIND_BLOBBI_INTERACTION,
    content: '',
    tags,
  };
}

// ─── Validator ────────────────────────────────────────────────────────────────

/**
 * Validate that a NostrEvent is a well-formed kind 1124 interaction.
 *
 * Checks:
 * - Correct kind
 * - Has `a` tag starting with "31124:"
 * - Has `p` tag (non-empty)
 * - Has `action` tag with a recognised V1 value
 * - Has `source` tag (non-empty)
 */
export function isValidInteractionEvent(event: NostrEvent): boolean {
  return parseInteractionEvent(event) !== undefined;
}

// ─── Parser ───────────────────────────────────────────────────────────────────

/**
 * Parse a NostrEvent into a typed BlobbiInteraction.
 * Returns `undefined` if the event is invalid.
 */
export function parseInteractionEvent(event: NostrEvent): BlobbiInteraction | undefined {
  if (event.kind !== KIND_BLOBBI_INTERACTION) return undefined;

  const tags = event.tags;
  const aTag = tags.find(([n]) => n === 'a')?.[1];
  const pTag = tags.find(([n]) => n === 'p')?.[1];
  const actionTag = tags.find(([n]) => n === 'action')?.[1];
  const sourceTag = tags.find(([n]) => n === 'source')?.[1];

  if (!aTag || !aTag.startsWith('31124:')) return undefined;
  if (!pTag) return undefined;
  if (!actionTag || !(INTERACTION_ACTIONS as readonly string[]).includes(actionTag)) return undefined;
  if (!sourceTag) return undefined;

  const blobbiTag = tags.find(([n]) => n === 'blobbi')?.[1];
  const itemTag = tags.find(([n]) => n === 'item')?.[1];

  return {
    event,
    blobbiCoordinate: aTag,
    ownerPubkey: pTag,
    action: actionTag as InteractionAction,
    source: sourceTag,
    blobbiShortId: blobbiTag,
    itemId: itemTag,
    authorPubkey: event.pubkey,
    createdAt: event.created_at,
  };
}

// ─── Deterministic Sort ───────────────────────────────────────────────────────

/**
 * Sort interaction events deterministically for projection.
 *
 * Order: ascending `created_at`, then ascending event `id` (hex comparison)
 * as tie-breaker. Returns a new array (does not mutate input).
 */
export function sortInteractionEvents(events: NostrEvent[]): NostrEvent[] {
  return [...events].sort((a, b) => {
    if (a.created_at !== b.created_at) return a.created_at - b.created_at;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

// ─── Fire-and-Forget Emitter ──────────────────────────────────────────────────

/**
 * Publish a kind 1124 interaction event as a best-effort follow-up.
 *
 * This is a fire-and-forget helper: the returned promise is intentionally
 * NOT awaited by the caller. If publication fails, a warning is logged and
 * the canonical 31124 update (which already succeeded) is not affected.
 *
 * @param publishEvent - The `mutateAsync` function from `useNostrPublish`
 * @param params - Interaction event parameters
 */
export function emitInteractionEvent(
  publishEvent: (template: { kind: number; content: string; tags: string[][] }) => Promise<unknown>,
  params: InteractionEventParams,
): void {
  const template = buildInteractionEventTemplate(params);
  publishEvent(template).catch((err: unknown) => {
    console.warn('[Blobbi] Failed to publish interaction event (kind 1124):', err);
  });
}

// ─── Social Checkpoint ────────────────────────────────────────────────────────

/**
 * Social interaction checkpoint stored in kind 31124 content JSON.
 *
 * When present, indicates the owner has consolidated interactions up to
 * `processed_until`. Clients use this as a `since` filter to avoid
 * re-fetching already-consolidated events.
 */
export interface SocialCheckpoint {
  /** Unix timestamp (seconds) up to which interactions have been processed */
  processed_until: number;
  /** Event id of the last processed interaction (for dedup at the boundary) */
  last_event_id: string;
}

/**
 * Resolved checkpoint result — discriminated union so consumers handle
 * both states explicitly.
 */
export type ResolvedCheckpoint =
  | { valid: true; checkpoint: SocialCheckpoint }
  | { valid: false; checkpoint: undefined };

/**
 * Parse a social checkpoint from kind 31124 content JSON.
 *
 * Returns `undefined` when:
 * - content is empty or not valid JSON
 * - `social_checkpoint` key is missing
 * - either `processed_until` or `last_event_id` is missing/invalid
 *
 * **Strict validity**: both `processed_until` (positive number) and
 * `last_event_id` (non-empty string) must be present. If either is
 * missing or malformed, the entire checkpoint is treated as absent.
 *
 * Internal parser — callers should use `resolveSocialCheckpoint()`.
 * Never throws.
 */
function parseSocialCheckpoint(content: string): SocialCheckpoint | undefined {
  if (!content || !content.trim()) return undefined;
  try {
    const raw = JSON.parse(content);
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined;
    const sc = raw.social_checkpoint;
    if (typeof sc !== 'object' || sc === null || Array.isArray(sc)) return undefined;
    if (typeof sc.processed_until !== 'number' || sc.processed_until <= 0) return undefined;
    if (typeof sc.last_event_id !== 'string' || !sc.last_event_id) return undefined;
    return { processed_until: sc.processed_until, last_event_id: sc.last_event_id };
  } catch {
    return undefined;
  }
}

/**
 * Canonical checkpoint resolution for kind 1124 social interactions.
 *
 * This is the **single entry point** for checkpoint interpretation. Both the
 * query layer (useBlobbiInteractions — derives `since` filter) and the
 * projection layer (applySocialInteractions — derives dedup seed) must
 * call this function so their checkpoint interpretation cannot drift.
 *
 * ## Resolution rules
 *
 * 1. Parse `social_checkpoint` from `companion.event.content` JSON.
 * 2. **Strict validity**: checkpoint is valid only when *both*
 *    `processed_until` (positive number) and `last_event_id` (non-empty
 *    string) are present. If either is missing or malformed, treat the
 *    entire checkpoint as absent.
 * 3. **V1 no-checkpoint fallback** (explicit):
 *    - Query: fetch kind 1124 events WITHOUT a `since` filter (no prior
 *      consolidation is assumed). A finite relay-side limit still applies
 *      (currently 50 events — see `BLOBBI_INTERACTIONS_LIMIT`). This
 *      means the first 50 most-recent events are fetched, NOT the full
 *      history. This is a known V1 limitation.
 *    - Projection: do NOT pre-exclude any interaction. All fetched events
 *      are processed.
 * 4. When checkpoint IS valid:
 *    - Query: set `since = checkpoint.processed_until`. Nostr `since` is
 *      inclusive (>=), so the boundary event may be re-fetched.
 *    - Projection: seed the dedup set with `checkpoint.last_event_id` so
 *      the boundary event is silently skipped.
 *
 * ## What this function does NOT do (V1 scope)
 *
 * - Does not advance the checkpoint
 * - Does not consolidate or write back to kind 31124
 * - Does not depend on `socialOpen` permission state
 *
 * @param companion - The Blobbi companion whose 31124 content may contain a checkpoint.
 *                    Pass `null` when no companion is selected.
 * @returns Discriminated union: `{ valid: true, checkpoint }` or `{ valid: false, checkpoint: undefined }`.
 */
export function resolveSocialCheckpoint(
  companion: BlobbiCompanion | null,
): ResolvedCheckpoint {
  if (!companion) {
    return { valid: false, checkpoint: undefined };
  }

  const parsed = parseSocialCheckpoint(companion.event.content);

  if (parsed) {
    return { valid: true, checkpoint: parsed };
  }

  // V1 explicit fallback: no valid checkpoint found.
  // Query will fetch without `since`; projection will not pre-exclude any event.
  return { valid: false, checkpoint: undefined };
}

// ─── Social Checkpoint Serialization ──────────────────────────────────────────

/**
 * Serialize a social checkpoint into kind 31124 content JSON.
 *
 * Follows the same pattern as `serializeEvolutionContent`: parses the existing
 * content, preserves all unknown top-level keys (including `evolution`), and
 * writes the `social_checkpoint` key.
 *
 * @param existingContent - The current 31124 content string (may be empty, non-JSON, or valid JSON).
 * @param checkpoint      - The new social checkpoint to write.
 * @returns Stringified JSON with the updated `social_checkpoint`.
 */
export function serializeSocialCheckpoint(
  existingContent: string,
  checkpoint: SocialCheckpoint,
): string {
  let base: Record<string, unknown> = {};
  if (existingContent && existingContent.trim()) {
    try {
      const parsed = JSON.parse(existingContent);
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        base = parsed;
      }
    } catch {
      // Old-format text content — start fresh
    }
  }
  return JSON.stringify({ ...base, social_checkpoint: checkpoint });
}
