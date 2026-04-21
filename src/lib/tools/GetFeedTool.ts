import { z } from 'zod';
import { nip19 } from 'nostr-tools';

import { DITTO_RELAYS } from '@/lib/appRelays';

import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';
import type { Tool, ToolResult, ToolContext } from './Tool';

const inputSchema = z.object({
  feed_name: z.string().optional().describe('Name of an existing feed: "follows", "global", or a saved feed label.'),
  kinds: z.array(z.number()).optional().describe('Event kind numbers to filter (e.g. [1] for text notes, [20] for photos, [30023] for articles).'),
  authors: z.array(z.string()).optional().describe('Author filter. Use "$me" for the logged-in user, "$contacts" for their follow list, or hex pubkeys.'),
  search: z.string().optional().describe('Full-text search query (NIP-50).'),
  hashtag: z.string().optional().describe('Filter by hashtag (without the # symbol).'),
  country: z.string().optional().describe('ISO 3166-1 alpha-2 country code (e.g. "VE", "US", "BR"). Queries NIP-73 geographic comments (kind 1111) for that country.'),
  hours: z.number().optional().describe('How many hours back to look. Default 12, max 168 (1 week).'),
  limit: z.number().optional().describe('Maximum number of posts to return. Default 50, max 100.'),
});

type Params = z.infer<typeof inputSchema>;

export const GetFeedTool: Tool<Params> = {
  description: `Read posts from a feed and return their content. Use this when the user asks what people are talking about, wants a summary of recent activity, or asks about a specific topic or country.

You can reference an existing feed by name or build a query on the fly:

**Named feeds:**
- "follows" — posts from people the user follows
- "global" — recent posts from everyone
- Any saved feed label the user has created (check the system prompt for available feeds)

**Ad-hoc queries:**
- kinds: event kinds to include (default: [1] for text notes)
- authors: who to include — "$me", "$contacts", or hex pubkeys
- search: full-text NIP-50 search query
- hashtag: filter by hashtag (without #)
- country: ISO 3166-1 alpha-2 country code (e.g. "VE", "US") — queries the country activity feed (kind 1111 geographic comments)

**Time window:**
- hours: how far back to look (default: 12, max: 168)

When the user asks about a country (e.g. "what's going on in Venezuela?"), use the country parameter. When they ask about their friends or follows, use feed_name "follows". When they ask about a topic, use search or hashtag.

After receiving results, summarize the key topics, conversations, and notable posts for the user.`,

  inputSchema,

  async execute(args: Params, ctx: ToolContext): Promise<ToolResult> {
    const feedName = (args.feed_name ?? '').trim().toLowerCase();
    const country = (args.country ?? '').trim().toUpperCase();
    const hours = Math.min(Math.max(1, args.hours ?? 12), 168);
    const limit = Math.min(Math.max(1, args.limit ?? 50), 100);
    const sinceTimestamp = Math.floor(Date.now() / 1000) - hours * 3600;

    const contactPubkeys = await fetchContactPubkeys(ctx);

    const resolved = resolveFilter(args, ctx, { feedName, country, hours, limit, sinceTimestamp, contactPubkeys });
    if ('error' in resolved) {
      return { result: JSON.stringify(resolved) };
    }

    const { filter, needsDittoRelay, feedLabel } = resolved;

    const store = needsDittoRelay ? ctx.nostr.group(DITTO_RELAYS) : ctx.nostr;
    const events = await store.query(
      [filter],
      { signal: AbortSignal.timeout(10000) },
    );

    const sorted = events.sort((a: NostrEvent, b: NostrEvent) => b.created_at - a.created_at);

    if (sorted.length === 0) {
      return {
        result: JSON.stringify({
          success: true,
          feed: feedLabel,
          hours,
          post_count: 0,
          data: `No posts found in the "${feedLabel}" feed in the past ${hours} hours.`,
        }),
      };
    }

    const text = await formatEvents(sorted, feedLabel, hours, ctx);

    return {
      result: JSON.stringify({
        success: true,
        feed: feedLabel,
        hours,
        post_count: sorted.length,
        data: text,
      }),
    };
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Fetch the logged-in user's contact list pubkeys. */
async function fetchContactPubkeys(ctx: ToolContext): Promise<string[]> {
  if (!ctx.user) return [];
  try {
    const contactEvents = await ctx.nostr.query(
      [{ kinds: [3], authors: [ctx.user.pubkey], limit: 1 }],
      { signal: AbortSignal.timeout(5000) },
    );
    return contactEvents[0]?.tags
      .filter(([t]) => t === 'p')
      .map(([, pk]) => pk) ?? [];
  } catch {
    return [];
  }
}

/** Resolve author variables ($me, $contacts) to concrete pubkeys. */
function resolveAuthors(
  authors: string[],
  userPubkey: string | undefined,
  contactPubkeys: string[],
): string[] {
  return authors.flatMap((a) => {
    if (a === '$me') return userPubkey ? [userPubkey] : [];
    if (a === '$contacts') return contactPubkeys;
    // Treat $follows the same as $contacts (saved feeds may use this form)
    if (a === '$follows') return contactPubkeys;
    return [a];
  });
}

interface ResolveContext {
  feedName: string;
  country: string;
  hours: number;
  limit: number;
  sinceTimestamp: number;
  contactPubkeys: string[];
}

type ResolvedFilter =
  | { filter: NostrFilter; needsDittoRelay: boolean; feedLabel: string }
  | { error: string; available_feeds?: string };

/** Build the Nostr filter from the tool arguments. */
function resolveFilter(
  args: Params, ctx: ToolContext,
  { feedName, country, limit, sinceTimestamp, contactPubkeys }: ResolveContext,
): ResolvedFilter {
  // Country query — NIP-73 geographic comments
  if (country) {
    // Validate as ISO 3166-1 alpha-2 (2 uppercase letters)
    if (!/^[A-Z]{2}$/.test(country)) {
      return { error: `Invalid country code "${country}". Use a 2-letter ISO 3166-1 alpha-2 code (e.g. "US", "VE", "JP").` };
    }
    return {
      filter: { kinds: [1111], '#I': [`iso3166:${country}`], since: sinceTimestamp, limit } as NostrFilter,
      needsDittoRelay: false,
      feedLabel: `country: ${country}`,
    };
  }

  // Named feed: follows
  if (feedName === 'follows') {
    if (!ctx.user) return { error: 'Must be logged in to read the follows feed.' };
    const authors = [ctx.user.pubkey, ...contactPubkeys];
    if (authors.length <= 1) return { error: 'The user is not following anyone yet.' };
    return { filter: { kinds: [1], authors, since: sinceTimestamp, limit }, needsDittoRelay: false, feedLabel: 'follows' };
  }

  // Named feed: global
  if (feedName === 'global') {
    return { filter: { kinds: [1], since: sinceTimestamp, limit }, needsDittoRelay: false, feedLabel: 'global' };
  }

  // Named feed: ditto (hot)
  if (feedName === 'ditto') {
    return { filter: { kinds: [1], since: sinceTimestamp, limit, search: 'sort:hot protocol:nostr' }, needsDittoRelay: true, feedLabel: 'ditto (hot)' };
  }

  // Named feed: user saved feed
  if (feedName) {
    const match = ctx.savedFeeds.find((f) => f.label.toLowerCase() === feedName);
    if (!match) {
      const available = ctx.savedFeeds.map((f) => f.label).join(', ');
      return {
        error: `No saved feed named "${args.feed_name}".`,
        available_feeds: available ? `follows, global, ditto, ${available}` : 'follows, global, ditto',
      };
    }
    try {
      const sf = match.filter as Record<string, unknown>;
      const filter: NostrFilter = { since: sinceTimestamp, limit };
      let needsDittoRelay = false;

      if (Array.isArray(sf.kinds)) filter.kinds = sf.kinds as number[];
      if (typeof sf.search === 'string') {
        filter.search = sf.search;
        // NIP-50 extensions (sort:, protocol:, etc.) require Ditto relay
        if (/sort:|protocol:|media:|language:/.test(sf.search)) needsDittoRelay = true;
      }
      if (Array.isArray(sf.authors)) {
        const resolved = resolveAuthors(sf.authors as string[], ctx.user?.pubkey, contactPubkeys);
        if (resolved.length > 0) filter.authors = resolved;
      }
      // Carry over any tag filters (e.g. #t, #p)
      for (const [key, value] of Object.entries(sf)) {
        if (key.startsWith('#') && Array.isArray(value)) {
          (filter as Record<string, unknown>)[key] = value;
        }
      }

      return { filter, needsDittoRelay, feedLabel: match.label };
    } catch (err) {
      return { error: `Failed to resolve saved feed "${match.label}": ${err instanceof Error ? err.message : 'Unknown error'}` };
    }
  }

  // Ad-hoc query — build filter directly from tool args
  const filter: NostrFilter = { since: sinceTimestamp, limit };
  let needsDittoRelay = false;

  filter.kinds = args.kinds ?? [1];

  if (args.authors) {
    const resolved = resolveAuthors(args.authors, ctx.user?.pubkey, contactPubkeys);
    if (resolved.length > 0) filter.authors = resolved;
  }

  if (args.search) {
    filter.search = args.search;
    if (/sort:|protocol:|media:|language:/.test(args.search)) needsDittoRelay = true;
  }

  if (args.hashtag?.trim()) {
    (filter as Record<string, unknown>)['#t'] = [args.hashtag.trim().toLowerCase()];
  }

  const feedLabel = args.search ? `search: ${args.search}` : args.hashtag ? `#${args.hashtag}` : 'ad-hoc';
  return { filter, needsDittoRelay, feedLabel };
}

/** Format events into a markdown summary with author display names. */
async function formatEvents(
  sorted: NostrEvent[], feedLabel: string, hours: number, ctx: ToolContext,
): Promise<string> {
  const uniquePubkeys = [...new Set(sorted.map((e) => e.pubkey))];
  const profileMap = new Map<string, { name?: string; display_name?: string; nip05?: string }>();

  try {
    const profiles = await ctx.nostr.query(
      [{ kinds: [0], authors: uniquePubkeys }],
      { signal: AbortSignal.timeout(5000) },
    );
    for (const p of profiles) {
      try {
        const meta = JSON.parse(p.content);
        profileMap.set(p.pubkey, {
          name: meta.name,
          display_name: meta.display_name,
          nip05: meta.nip05,
        });
      } catch {
        // Skip invalid metadata
      }
    }
  } catch {
    // Profiles unavailable — continue with pubkey-only display
  }

  const formatTimeAgo = (ts: number): string => {
    const seconds = Math.floor(Date.now() / 1000) - ts;
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  };

  let text = `## ${feedLabel} — past ${hours}h (${sorted.length} posts)\n\n`;

  for (const event of sorted) {
    const profile = profileMap.get(event.pubkey);
    const displayName = profile?.display_name || profile?.name || nip19.npubEncode(event.pubkey).slice(0, 16) + '...';

    const hashtags = event.tags
      .filter(([t]) => t === 't')
      .map(([, v]) => `#${v}`)
      .join(' ');

    text += `**${displayName}** (${formatTimeAgo(event.created_at)}):\n`;
    text += `${event.content.slice(0, 500)}${event.content.length > 500 ? '...' : ''}\n`;
    if (hashtags) text += `Tags: ${hashtags}\n`;
    text += '\n---\n\n';
  }

  return text;
}
