import { z } from 'zod';
import { nip19 } from 'nostr-tools';

import type { NostrEvent } from '@nostrify/nostrify';
import type { Tool, ToolResult, ToolContext } from './Tool';

const inputSchema = z.object({
  identifier: z.string().describe('NIP-19 identifier (npub1..., note1..., nevent1..., naddr1..., nprofile1...).'),
});

type Params = z.infer<typeof inputSchema>;

export const FetchEventTool: Tool<Params> = {
  description: `Fetch a Nostr event by its NIP-19 identifier. Supports npub (fetches kind 0 profile), nprofile, note (fetches event by ID), nevent, and naddr (fetches addressable event by kind+author+d-tag).

Use this when the user shares a Nostr identifier and you need to read its content — for example, to see what a note says, look up a user's profile, or read an article.

Returns the full event JSON including kind, content, tags, pubkey, and timestamp.`,

  inputSchema,

  async execute(args: Params, ctx: ToolContext): Promise<ToolResult> {
    const identifier = args.identifier.trim();
    if (!identifier) {
      return { result: JSON.stringify({ error: 'A NIP-19 identifier is required.' }) };
    }

    let decoded: nip19.DecodedResult;
    try {
      decoded = nip19.decode(identifier);
    } catch {
      return { result: JSON.stringify({ error: `Invalid NIP-19 identifier: ${identifier}` }) };
    }

    if (decoded.type === 'nsec') {
      return { result: JSON.stringify({ error: 'nsec identifiers are not supported for security reasons.' }) };
    }

    let event: NostrEvent | undefined;

    switch (decoded.type) {
      case 'npub': {
        const events = await ctx.nostr.query(
          [{ kinds: [0], authors: [decoded.data], limit: 1 }],
          { signal: AbortSignal.timeout(8000) },
        );
        event = events[0];
        break;
      }
      case 'nprofile': {
        const events = await ctx.nostr.query(
          [{ kinds: [0], authors: [decoded.data.pubkey], limit: 1 }],
          { signal: AbortSignal.timeout(8000) },
        );
        event = events[0];
        break;
      }
      case 'note': {
        const events = await ctx.nostr.query(
          [{ ids: [decoded.data] }],
          { signal: AbortSignal.timeout(8000) },
        );
        event = events[0];
        break;
      }
      case 'nevent': {
        const events = await ctx.nostr.query(
          [{ ids: [decoded.data.id] }],
          { signal: AbortSignal.timeout(8000) },
        );
        event = events[0];
        break;
      }
      case 'naddr': {
        const events = await ctx.nostr.query(
          [{
            kinds: [decoded.data.kind],
            authors: [decoded.data.pubkey],
            '#d': [decoded.data.identifier],
            limit: 1,
          }],
          { signal: AbortSignal.timeout(8000) },
        );
        event = events[0];
        break;
      }
      default:
        return { result: JSON.stringify({ error: `Unsupported identifier type: ${(decoded as { type: string }).type}` }) };
    }

    if (!event) {
      return { result: JSON.stringify({ error: 'No event found for the provided identifier.' }) };
    }

    return { result: JSON.stringify(event) };
  },
};
