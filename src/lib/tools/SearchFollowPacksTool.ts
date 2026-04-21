import { z } from 'zod';

import type { Tool, ToolResult, ToolContext } from './Tool';

const inputSchema = z.object({
  query: z.string().describe('The follow pack title to search for (e.g. "team soapbox", "bitcoin developers", "nostr OGs").'),
});

type Params = z.infer<typeof inputSchema>;

export const SearchFollowPacksTool: Tool<Params> = {
  description: `Search for Nostr follow packs by title. Follow packs (kind 39089) are curated lists of people. Use this when the user mentions a follow pack or starter pack by name — for example, "team soapbox pack" or "bitcoin developers pack".

Returns matching packs with their title, description, member count, and the hex pubkeys of all members. Use the returned pubkeys directly in the spell's authors array to create a feed based on the pack's members.`,

  inputSchema,

  async execute(args: Params, ctx: ToolContext): Promise<ToolResult> {
    const query = args.query.trim().toLowerCase();
    if (!query) {
      return { result: JSON.stringify({ error: 'A search query is required.' }) };
    }

    const filters: { kinds: number[]; limit: number; search?: string; authors?: string[] }[] = [
      { kinds: [39089], limit: 200 },
    ];

    filters.push({ kinds: [39089], search: args.query, limit: 50 });

    if (ctx.user) {
      filters.push({ kinds: [39089], authors: [ctx.user.pubkey], limit: 50 });
    }

    const events = await ctx.nostr.query(
      filters,
      { signal: AbortSignal.timeout(10000) },
    );

    // Deduplicate by event id
    const seen = new Set<string>();
    const uniqueEvents = events.filter((e) => {
      if (seen.has(e.id)) return false;
      seen.add(e.id);
      return true;
    });

    interface PackMatch {
      title: string;
      description?: string;
      member_count: number;
      pubkeys: string[];
      author: string;
    }

    const matches: PackMatch[] = [];

    for (const event of uniqueEvents) {
      const title = (event.tags.find(([t]) => t === 'title')?.[1]
        ?? event.tags.find(([t]) => t === 'name')?.[1]
        ?? '').trim();

      if (!title) continue;
      if (!title.toLowerCase().includes(query)) continue;

      const description = event.tags.find(([t]) => t === 'description')?.[1]
        ?? event.tags.find(([t]) => t === 'summary')?.[1];

      const pubkeys = event.tags
        .filter(([t]) => t === 'p')
        .map(([, pk]) => pk);

      if (pubkeys.length === 0) continue;

      matches.push({
        title,
        description: description ? description.slice(0, 150) : undefined,
        member_count: pubkeys.length,
        pubkeys,
        author: event.pubkey,
      });
    }

    matches.sort((a, b) => {
      const aExact = a.title.toLowerCase() === query ? 1 : 0;
      const bExact = b.title.toLowerCase() === query ? 1 : 0;
      if (aExact !== bExact) return bExact - aExact;
      return b.member_count - a.member_count;
    });

    const results = matches.slice(0, 5);

    if (results.length === 0) {
      return { result: JSON.stringify({ matches: [], message: `No follow packs found matching "${args.query}".` }) };
    }

    return { result: JSON.stringify({ matches: results }) };
  },
};
