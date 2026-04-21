import { z } from 'zod';

import { fetchContactPubkeys } from './helpers';

import type { Tool, ToolResult, ToolContext } from './Tool';

const inputSchema = z.object({
  query: z.string().describe('The name or display name to search for (e.g. "Derek Ross", "fiatjaf", "jb55").'),
});

type Params = z.infer<typeof inputSchema>;

export const SearchUsersTool: Tool<Params> = {
  description: `Search for Nostr users by name. Returns matching profiles with their pubkeys, display names, NIP-05 identifiers, and bios. Use this when you need to resolve a person's name to their Nostr pubkey — for example, when creating a spell that targets a specific author.

The search checks the user's follow list first (contacts), then falls back to a broader relay search. Results from contacts are prioritized since they're more likely to be the person the user means.`,

  inputSchema,

  async execute(args: Params, ctx: ToolContext): Promise<ToolResult> {
    const query = args.query.trim().toLowerCase();
    if (!query) {
      return { result: JSON.stringify({ error: 'A search query is required.' }) };
    }

    interface ProfileMatch {
      pubkey: string;
      name?: string;
      display_name?: string;
      nip05?: string;
      about?: string;
      source: 'contacts' | 'relay';
    }

    const matches: ProfileMatch[] = [];

    // Phase 1: Search user's contacts
    const contactPubkeys = await fetchContactPubkeys(ctx);

    if (contactPubkeys.length > 0) {
      const metaEvents = await ctx.nostr.query(
        [{ kinds: [0], authors: contactPubkeys }],
        { signal: AbortSignal.timeout(8000) },
      );

      for (const event of metaEvents) {
        if (matches.length >= 5) break;
        try {
          const meta = JSON.parse(event.content);
          const name = (meta.name || '').toLowerCase();
          const displayName = (meta.display_name || '').toLowerCase();
          const nip05 = (meta.nip05 || '').toLowerCase();

          if (name.includes(query) || displayName.includes(query) || nip05.includes(query)) {
            matches.push({
              pubkey: event.pubkey,
              name: meta.name,
              display_name: meta.display_name,
              nip05: meta.nip05,
              about: meta.about ? meta.about.slice(0, 100) : undefined,
              source: 'contacts',
            });
          }
        } catch {
          // Skip events with invalid metadata JSON
        }
      }
    }

    // Phase 2: NIP-50 relay search (if contacts didn't yield enough results)
    if (matches.length < 3) {
      try {
        const searchEvents = await ctx.nostr.query(
          [{ kinds: [0], search: args.query, limit: 10 }],
          { signal: AbortSignal.timeout(8000) },
        );

        const existingPubkeys = new Set(matches.map((m) => m.pubkey));

        for (const event of searchEvents) {
          if (existingPubkeys.has(event.pubkey)) continue;
          try {
            const meta = JSON.parse(event.content);
            matches.push({
              pubkey: event.pubkey,
              name: meta.name,
              display_name: meta.display_name,
              nip05: meta.nip05,
              about: meta.about ? meta.about.slice(0, 100) : undefined,
              source: 'relay',
            });
          } catch {
            // Skip events with invalid metadata JSON
          }
        }
      } catch {
        // NIP-50 search may not be supported by all relays
      }
    }

    const results = matches.slice(0, 5);

    if (results.length === 0) {
      return { result: JSON.stringify({ matches: [], message: `No users found matching "${args.query}". The user may need to provide an npub or NIP-05 address.` }) };
    }

    return { result: JSON.stringify({ matches: results }) };
  },
};
