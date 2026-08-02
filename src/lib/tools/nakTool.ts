import { nip19 } from 'nostr-tools';
import { z } from 'zod';
import type { NostrEvent, NostrFilter, NPool } from '@nostrify/nostrify';
import type { Tool, ToolResult } from '@soapbox.pub/nostr-canvas/devkit';

import { isNostrId } from '@/lib/nostrId';

// ─── Input schemas ──────────────────────────────────────────────────────────

const reqInput = z.object({
  action: z.literal('req'),
  kinds: z
    .array(z.number())
    .describe('Event kind numbers to query, e.g. [1] for text notes or [0] for profiles. Required.'),
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
});

const fetchInput = z.object({
  action: z.literal('fetch'),
  id: z
    .string()
    .describe('The event id as a 64-char hex string, or a note1/nevent1 NIP-19 identifier.'),
});

const profileInput = z.object({
  action: z.literal('profile'),
  pubkey: z
    .string()
    .describe('The pubkey as a 64-char hex string, or an npub1/nprofile1 NIP-19 identifier.'),
});

const decodeInput = z.object({
  action: z.literal('decode'),
  identifier: z
    .string()
    .describe('Any NIP-19 identifier: npub1, nprofile1, note1, nevent1, naddr1. nsec1 is accepted, but its secret key bytes are redacted from the result.'),
});

const encodeInput = z.object({
  action: z.literal('encode'),
  type: z
    .enum(['npub', 'note', 'nprofile', 'nevent', 'naddr'])
    .describe('The NIP-19 type to encode.'),
  pubkey: z
    .string()
    .optional()
    .describe('A 64-char hex pubkey. Required for npub, nprofile, and naddr.'),
  id: z
    .string()
    .optional()
    .describe('A 64-char hex event id. Required for note and nevent.'),
  identifier: z
    .string()
    .optional()
    .describe('The d-tag identifier value. Required for naddr.'),
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

const inputSchema = z.discriminatedUnion('action', [
  reqInput,
  fetchInput,
  profileInput,
  decodeInput,
  encodeInput,
]);

export type NakInput = z.infer<typeof inputSchema>;

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
      const signal = AbortSignal.timeout(QUERY_TIMEOUT_MS);

      switch (args.action) {
        case 'req': {
          const limit = Math.min(Math.max(args.limit ?? 20, 1), 50);
          const filter: Record<string, unknown> = { kinds: args.kinds, limit };

          if (args.authors) {
            const invalid = args.authors.filter((author) => !isNostrId(author));
            if (invalid.length > 0) {
              return {
                content: JSON.stringify({
                  error: `Authors must be 64-char hex pubkeys. Invalid: ${invalid.join(', ')}.`,
                }),
              };
            }
            filter.authors = args.authors;
          }
          if (args.since !== undefined) filter.since = args.since;
          if (args.until !== undefined) filter.until = args.until;
          for (const [key, values] of Object.entries(args.tags ?? {})) {
            const letter = key.replace(/^#/, '');
            if (/^[a-zA-Z]$/.test(letter) && values.length > 0) {
              filter[`#${letter}`] = values;
            }
          }

          const events = await nostr.query([filter as NostrFilter], { signal });
          return { content: formatEvents(events) };
        }

        case 'fetch': {
          const resolved = resolveEventId(args.id);
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
          const resolved = resolvePubkey(args.pubkey);
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
            const metadata = JSON.parse(event.content) as Record<string, unknown>;
            return { content: JSON.stringify({ ...metadata, pubkey: resolved.hex }) };
          } catch {
            return { content: JSON.stringify({ pubkey: resolved.hex, content: event.content }) };
          }
        }

        case 'decode': {
          try {
            const decoded = nip19.decode(args.identifier);
            if (decoded.type === 'nsec') {
              // Never hand secret key bytes to the model context.
              return { content: JSON.stringify({ type: 'nsec', data: null, note: 'Secret key bytes redacted for security.' }) };
            }
            return { content: JSON.stringify({ type: decoded.type, data: decoded.data }) };
          } catch {
            return {
              content: JSON.stringify({
                error: `Invalid NIP-19 identifier: ${args.identifier}.`,
              }),
            };
          }
        }

        case 'encode': {
          switch (args.type) {
            case 'npub': {
              if (!isNostrId(args.pubkey)) {
                return { content: `Cannot encode npub: pubkey must be a 64-char hex string, got ${args.pubkey ?? 'nothing'}.` };
              }
              return { content: nip19.npubEncode(args.pubkey) };
            }
            case 'note': {
              if (!isNostrId(args.id)) {
                return { content: `Cannot encode note: id must be a 64-char hex string, got ${args.id ?? 'nothing'}.` };
              }
              return { content: nip19.noteEncode(args.id) };
            }
            case 'nprofile': {
              if (!isNostrId(args.pubkey)) {
                return { content: `Cannot encode nprofile: pubkey must be a 64-char hex string, got ${args.pubkey ?? 'nothing'}.` };
              }
              return { content: nip19.nprofileEncode({ pubkey: args.pubkey, relays: args.relays }) };
            }
            case 'nevent': {
              if (!isNostrId(args.id)) {
                return { content: `Cannot encode nevent: id must be a 64-char hex string, got ${args.id ?? 'nothing'}.` };
              }
              if (args.author !== undefined && !isNostrId(args.author)) {
                return { content: `Cannot encode nevent: author must be a 64-char hex string, got ${args.author}.` };
              }
              return {
                content: nip19.neventEncode({
                  id: args.id,
                  relays: args.relays,
                  author: args.author,
                  kind: args.kind,
                }),
              };
            }
            case 'naddr': {
              if (!isNostrId(args.pubkey)) {
                return { content: `Cannot encode naddr: pubkey must be a 64-char hex string, got ${args.pubkey ?? 'nothing'}.` };
              }
              if (typeof args.identifier !== 'string' || args.identifier.length === 0) {
                return { content: 'Cannot encode naddr: identifier is required.' };
              }
              if (typeof args.kind !== 'number') {
                return { content: 'Cannot encode naddr: kind is required.' };
              }
              return {
                content: nip19.naddrEncode({
                  identifier: args.identifier,
                  pubkey: args.pubkey,
                  kind: args.kind,
                  relays: args.relays,
                }),
              };
            }
          }
        }
      }
    },
  };
}
