import { nip19 } from 'nostr-tools';
import { z } from 'zod';
import type { NostrEvent, NostrFilter, NPool } from '@nostrify/nostrify';
import type { Tool, ToolResult } from '@soapbox.pub/nostr-canvas/devkit';

import { isNostrId } from '@/lib/nostrId';

// ─── Input schemas ──────────────────────────────────────────────────────────
//
// One flat object for all five actions instead of a discriminated union:
// `z.toJSONSchema()` renders a discriminated union as a JSON Schema `oneOf`
// with no top-level `type` key, and devkit's `toolToOpenAI()` only simplifies
// `anyOf`, so the function `parameters` sent to the model would lack
// `type: "object"` — which some OpenAI-compatible providers reject with a 400.
// A flat object with an `action` enum always emits `type: "object"`.
// Every field except `action` is optional; `execute()` checks the fields each
// action needs at runtime, because devkit calls `execute()` without parsing
// the args through this schema first.

export const inputSchema = z.object({
  action: z
    .enum(['req', 'fetch', 'profile', 'decode', 'encode'])
    .describe('The nak action to run: req, fetch, profile, decode, or encode.'),
  // req
  kinds: z
    .array(z.number())
    .optional()
    .describe('Event kind numbers to query, e.g. [1] for text notes or [0] for profiles. Required for the req action.'),
  authors: z
    .array(z.string())
    .optional()
    .describe('Filter by author pubkeys. Each must be a 64-char hex string.'),
  tags: z
    .record(z.string(), z.array(z.string()))
    .optional()
    .describe('Filter by tag values, keyed by the single letter without the "#" prefix, e.g. {"t": ["nostr"]} for the #t tag or {"p": ["<pubkey hex>"]} for #p.'),
  since: z
    .number()
    .optional()
    .describe('Only events newer than this unix timestamp in seconds.'),
  until: z
    .number()
    .optional()
    .describe('Only events older than this unix timestamp in seconds.'),
  limit: z
    .number()
    .optional()
    .describe('Maximum number of events to return. Defaults to 20, capped at 50.'),
  // fetch and encode share this field.
  id: z
    .string()
    .optional()
    .describe('The event id as a 64-char hex string, or a note1/nevent1 NIP-19 identifier. Required for the fetch action; for encode, required for note and nevent.'),
  // profile and encode share this field.
  pubkey: z
    .string()
    .optional()
    .describe('The pubkey as a 64-char hex string, or an npub1/nprofile1 NIP-19 identifier. Required for the profile action; for encode, required for npub, nprofile, and naddr.'),
  // decode and encode share this field.
  identifier: z
    .string()
    .optional()
    .describe('Any NIP-19 identifier: npub1, nprofile1, note1, nevent1, naddr1. nsec1 is accepted, but its secret key bytes are redacted from the result. For the encode action, the d-tag identifier value, required for naddr.'),
  // encode
  type: z
    .enum(['npub', 'note', 'nprofile', 'nevent', 'naddr'])
    .optional()
    .describe('The NIP-19 type to encode. Required for the encode action.'),
  kind: z
    .number()
    .optional()
    .describe('The event kind. Required for naddr, optional for nevent.'),
  author: z
    .string()
    .optional()
    .describe('A 64-char hex author pubkey. Optional for nevent.'),
  relays: z
    .array(z.string())
    .optional()
    .describe('Relay URLs to embed. Optional for nprofile, nevent, and naddr.'),
});

type NakInput = z.infer<typeof inputSchema>;

// ─── Result formatting ──────────────────────────────────────────────────────

const SNIPPET_LENGTH = 200;
const OUTPUT_LIMIT = 6_000;

/**
 * One line per field so the model can scan a batch of events cheaply; the
 * content is collapsed to a single line and truncated to keep the result
 * from blowing up the model's context window.
 */
function summarizeEvent(event: NostrEvent, index: number): string {
  const collapsed = event.content.replace(/\s+/g, ' ').trim();
  const snippet = collapsed.slice(0, SNIPPET_LENGTH);
  const content = collapsed.length > SNIPPET_LENGTH ? `${snippet}…` : snippet;
  return [
    `## Event ${index + 1}`,
    `id: ${event.id}`,
    `kind: ${event.kind}`,
    `pubkey: ${event.pubkey}`,
    `created_at: ${event.created_at}`,
    `content: ${content || '(empty)'}`,
  ].join('\n');
}

/** Format a batch of events, dropping the tail once the output gets too large. */
function formatEvents(events: NostrEvent[]): string {
  const parts: string[] = [];
  let size = 0;
  let truncated = false;

  for (let i = 0; i < events.length; i++) {
    const formatted = summarizeEvent(events[i], i);
    if (size + formatted.length > OUTPUT_LIMIT) {
      truncated = true;
      break;
    }
    parts.push(formatted);
    size += formatted.length;
  }

  const lines = [`Found ${events.length} event(s):`, ...parts];
  if (truncated) {
    lines.push(`(${events.length - parts.length} more not shown — narrow the filter or raise the limit.)`);
  }
  return lines.join('\n\n');
}

/**
 * Cap a single oversized profile string field before it is serialized.
 */
const PROFILE_FIELD_LIMIT = 1_000;

/**
 * Serialize a profile as valid JSON, capped at the output limit. Oversized
 * string fields are shortened before stringifying — never after — so the
 * result always parses. If the capped profile is still too large (many
 * fields), tail fields are dropped until it fits.
 */
function serializeProfile(profile: Record<string, unknown>): string {
  const capped: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(profile)) {
    capped[key] = typeof value === 'string' && value.length > PROFILE_FIELD_LIMIT
      ? `${value.slice(0, PROFILE_FIELD_LIMIT)}…`
      : value;
  }
  let entries = Object.entries(capped);
  let serialized = JSON.stringify(Object.fromEntries(entries));
  while (serialized.length > OUTPUT_LIMIT && entries.length > 1) {
    entries = entries.slice(0, -1);
    serialized = JSON.stringify(Object.fromEntries(entries));
  }
  return serialized;
}

// ─── Identifier resolution ──────────────────────────────────────────────────

/** Resolve a raw-hex-or-bech32 event id to hex, or return an error string. */
function resolveEventId(id: string): { hex: string } | { error: string } {
  if (isNostrId(id)) return { hex: id };
  try {
    const decoded = nip19.decode(id);
    if (decoded.type === 'note') return { hex: decoded.data };
    if (decoded.type === 'nevent') return { hex: decoded.data.id };
    return { error: `Expected a note1/nevent1 identifier, got ${decoded.type}.` };
  } catch {
    return { error: `Cannot parse "${id}" as a hex event id or NIP-19 identifier.` };
  }
}

/** Resolve a raw-hex-or-bech32 pubkey to hex, or return an error string. */
function resolvePubkey(pubkey: string): { hex: string } | { error: string } {
  if (isNostrId(pubkey)) return { hex: pubkey };
  try {
    const decoded = nip19.decode(pubkey);
    if (decoded.type === 'npub') return { hex: decoded.data };
    if (decoded.type === 'nprofile') return { hex: decoded.data.pubkey };
    return { error: `Expected an npub1/nprofile1 identifier, got ${decoded.type}.` };
  } catch {
    return { error: `Cannot parse "${pubkey}" as a hex pubkey or NIP-19 identifier.` };
  }
}

const QUERY_TIMEOUT_MS = 10_000;

/**
 * Build the nak tool. The description doubles as the model-facing contract
 * (converted to a JSON schema via toolToOpenAI), so it must stay complete
 * on its own. `nostr` is Ditto's live relay pool from `useNostr()`, so the
 * tool reuses the app's real connection pool instead of opening a second one.
 *
 * v1 is strictly read-only: no action publishes or signs events.
 */
export function createNakTool(nostr: NPool): Tool<NakInput> {
  return {
    description: `Read-only access to the Nostr network, like the nak CLI. Queries run through Ditto's own relay pool. You can never publish or sign events with this tool.

Actions (the "action" field selects one):
- req: Query events. "kinds" is required (an array of kind numbers). Optionally filter by "authors" (array of 64-char hex pubkeys), "tags" (object mapping a single tag letter without "#" to its values, e.g. {"t": ["nostr"]} or {"p": ["<hex pubkey>"]}), "since"/"until" (unix timestamps in seconds), and "limit" (default 20, max 50). Returns a compact summary of each event: id, kind, pubkey, created_at, and a content snippet.
- fetch: Get one event by id. Accepts a 64-char hex id or a note1/nevent1 identifier. Returns the same compact summary.
- profile: Get a user's kind-0 profile metadata. Accepts a 64-char hex pubkey or an npub1/nprofile1 identifier. Returns the parsed profile JSON (name, picture, about, etc.).
- decode: Decode a NIP-19 identifier (npub1, note1, nevent1, nprofile1, naddr1) into its type and data. nsec1 decodes to a redaction notice: the secret key bytes are never returned.
- encode: Build a NIP-19 identifier. "type" is one of npub, note, nprofile, nevent, naddr. Provide the fields each type needs: pubkey for npub/nprofile/naddr, id for note/nevent, identifier and kind for naddr; author/kind are optional extras for nevent, relays for nprofile/nevent/naddr.`,
    inputSchema,
    async execute(args: NakInput): Promise<ToolResult> {
      // devkit calls execute() without parsing args through inputSchema
      // first, so validate here: model-supplied garbage (a string where an
      // array belongs, an out-of-enum action, ...) must not flow into filter
      // construction or fall through the switch to `undefined`.
      const parsed = inputSchema.safeParse(args);
      if (!parsed.success) {
        const details = parsed.error.issues
          .map((issue) => {
            const path = issue.path.join('.');
            return path.length > 0 ? `${path}: ${issue.message}` : issue.message;
          })
          .join('; ');
        return {
          content: JSON.stringify({
            error: `Invalid arguments for the nak tool: ${details}.`,
          }),
        };
      }
      const validated = parsed.data;

      const signal = AbortSignal.timeout(QUERY_TIMEOUT_MS);

      switch (validated.action) {
        case 'req': {
          if (!Array.isArray(validated.kinds)) {
            return {
              content: JSON.stringify({
                error: 'The "kinds" field is required for the req action.',
              }),
            };
          }
          const limit = Math.min(Math.max(validated.limit ?? 20, 1), 50);
          const filter: Record<string, unknown> = { kinds: validated.kinds, limit };

          if (validated.authors) {
            const invalid = validated.authors.filter((author) => !isNostrId(author));
            if (invalid.length > 0) {
              return {
                content: JSON.stringify({
                  error: `Authors must be 64-char hex pubkeys. Invalid: ${invalid.join(', ')}.`,
                }),
              };
            }
            filter.authors = validated.authors;
          }
          if (validated.since !== undefined) filter.since = validated.since;
          if (validated.until !== undefined) filter.until = validated.until;
          for (const [key, values] of Object.entries(validated.tags ?? {})) {
            const letter = key.replace(/^#/, '');
            if (/^[a-zA-Z]$/.test(letter) && values.length > 0) {
              filter[`#${letter}`] = values;
            }
          }

          const events = await nostr.query([filter as NostrFilter], { signal });
          return { content: formatEvents(events) };
        }

        case 'fetch': {
          if (typeof validated.id !== 'string') {
            return {
              content: JSON.stringify({
                error: 'The "id" field is required for the fetch action.',
              }),
            };
          }
          const resolved = resolveEventId(validated.id);
          if ('error' in resolved) {
            return { content: JSON.stringify({ error: resolved.error }) };
          }
          const [event] = await nostr.query(
            [{ ids: [resolved.hex], limit: 1 }],
            { signal },
          );
          if (!event) {
            return { content: `Event ${resolved.hex} not found.` };
          }
          return { content: formatEvents([event]) };
        }

        case 'profile': {
          if (typeof validated.pubkey !== 'string') {
            return {
              content: JSON.stringify({
                error: 'The "pubkey" field is required for the profile action.',
              }),
            };
          }
          const resolved = resolvePubkey(validated.pubkey);
          if ('error' in resolved) {
            return { content: JSON.stringify({ error: resolved.error }) };
          }
          const [event] = await nostr.query(
            [{ kinds: [0], authors: [resolved.hex], limit: 1 }],
            { signal },
          );
          if (!event) {
            return { content: `No profile found for ${resolved.hex}.` };
          }
          try {
            // Drop any `pubkey` the profile itself claims, then put the
            // resolved one first: serializeProfile drops tail fields when the
            // result is still oversized, and a profile padded with junk fields
            // must not be able to evict the field that says whose profile it is.
            const { pubkey: _claimed, ...metadata } = JSON.parse(event.content) as Record<string, unknown>;
            return { content: serializeProfile({ pubkey: resolved.hex, ...metadata }) };
          } catch {
            return { content: serializeProfile({ pubkey: resolved.hex, content: event.content }) };
          }
        }

        case 'decode': {
          if (typeof validated.identifier !== 'string') {
            return {
              content: JSON.stringify({
                error: 'The "identifier" field is required for the decode action.',
              }),
            };
          }
          try {
            const decoded = nip19.decode(validated.identifier);
            if (decoded.type === 'nsec') {
              // Never hand secret key bytes to the model context.
              return { content: JSON.stringify({ type: 'nsec', data: null, note: 'Secret key bytes redacted for security.' }) };
            }
            return { content: JSON.stringify({ type: decoded.type, data: decoded.data }) };
          } catch {
            return {
              content: JSON.stringify({
                error: `Invalid NIP-19 identifier: ${validated.identifier}.`,
              }),
            };
          }
        }

        case 'encode': {
          if (typeof validated.type !== 'string') {
            return {
              content: JSON.stringify({
                error: 'The "type" field is required for the encode action.',
              }),
            };
          }
          switch (validated.type) {
            case 'npub': {
              if (!isNostrId(validated.pubkey)) {
                return { content: `Cannot encode npub: pubkey must be a 64-char hex string, got ${validated.pubkey ?? 'nothing'}.` };
              }
              return { content: nip19.npubEncode(validated.pubkey) };
            }
            case 'note': {
              if (!isNostrId(validated.id)) {
                return { content: `Cannot encode note: id must be a 64-char hex string, got ${validated.id ?? 'nothing'}.` };
              }
              return { content: nip19.noteEncode(validated.id) };
            }
            case 'nprofile': {
              if (!isNostrId(validated.pubkey)) {
                return { content: `Cannot encode nprofile: pubkey must be a 64-char hex string, got ${validated.pubkey ?? 'nothing'}.` };
              }
              return { content: nip19.nprofileEncode({ pubkey: validated.pubkey, relays: validated.relays }) };
            }
            case 'nevent': {
              if (!isNostrId(validated.id)) {
                return { content: `Cannot encode nevent: id must be a 64-char hex string, got ${validated.id ?? 'nothing'}.` };
              }
              if (validated.author !== undefined && !isNostrId(validated.author)) {
                return { content: `Cannot encode nevent: author must be a 64-char hex string, got ${validated.author}.` };
              }
              return {
                content: nip19.neventEncode({
                  id: validated.id,
                  relays: validated.relays,
                  author: validated.author,
                  kind: validated.kind,
                }),
              };
            }
            case 'naddr': {
              if (!isNostrId(validated.pubkey)) {
                return { content: `Cannot encode naddr: pubkey must be a 64-char hex string, got ${validated.pubkey ?? 'nothing'}.` };
              }
              if (typeof validated.identifier !== 'string' || validated.identifier.length === 0) {
                return { content: 'Cannot encode naddr: identifier is required.' };
              }
              if (typeof validated.kind !== 'number') {
                return { content: 'Cannot encode naddr: kind is required.' };
              }
              return {
                content: nip19.naddrEncode({
                  identifier: validated.identifier,
                  pubkey: validated.pubkey,
                  kind: validated.kind,
                  relays: validated.relays,
                }),
              };
            }
            default: {
              return {
                content: JSON.stringify({
                  error: `Unknown encode type: ${String(validated.type)}.`,
                }),
              };
            }
          }
        }

        default: {
          return {
            content: JSON.stringify({
              error: `Unknown nak action: ${String(validated.action)}.`,
            }),
          };
        }
      }
    },
  };
}
