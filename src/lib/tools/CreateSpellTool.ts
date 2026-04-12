import { z } from 'zod';

import { buildSpellTags } from '@/lib/spellEngine';
import { getBuddyOrEphemeralKey, signAndPublishWithProfile } from './helpers';

import type { Tool, ToolResult, ToolContext } from './Tool';

const inputSchema = z.object({
  name: z.string().describe('Short human-readable name for the spell (e.g. "fren bitcoin", "my mass deletions").'),
  description: z.string().optional().describe('Optional longer description of what the spell does.'),
  cmd: z.enum(['REQ', 'COUNT']).optional().describe('Command type. "REQ" returns matching events as a feed (default). "COUNT" returns just the count of matches.'),
  kinds: z.array(z.number()).optional().describe('Event kind numbers to filter (e.g. [1] for text notes, [20] for photos, [30023] for articles, [9735] for zap receipts).'),
  authors: z.array(z.string()).optional().describe('Author filter. Use "$me" for the logged-in user, "$contacts" for their follow list, or hex pubkeys.'),
  tag_filters: z.array(z.object({
    letter: z.string().describe('Single-letter tag name (e.g. "t" for hashtags, "e" for event references, "p" for pubkey references).'),
    values: z.array(z.string()).describe('Tag values to match. Supports "$me" and "$contacts" variables.'),
  })).optional().describe('Tag-based filters. Each entry becomes a #<letter> filter in the Nostr query.'),
  since: z.string().optional().describe('Only include events after this time. Accepts relative durations ("7d", "2w", "1mo", "1y", "24h") or "now".'),
  until: z.string().optional().describe('Only include events before this time. Same format as since.'),
  limit: z.number().optional().describe('Maximum number of results to return.'),
  search: z.string().optional().describe('Full-text search query (NIP-50). Filters events by content text.'),
  relays: z.array(z.string()).optional().describe('Specific relay WebSocket URLs to query (e.g. ["wss://relay.damus.io"]). If omitted, uses the user\'s default relays.'),
  media: z.enum(['all', 'images', 'videos', 'vines', 'none']).optional().describe('Media filter. "images" = only posts with images, "videos" = only videos, "vines" = short-form video, "none" = text only. Omit for all content.'),
  language: z.string().optional().describe('Language filter (ISO 639-1 code, e.g. "en", "ja", "es"). Only returns posts in this language. Requires Ditto relay.'),
  platform: z.enum(['nostr', 'activitypub', 'atproto']).optional().describe('Protocol filter. "nostr" = native Nostr only (default), "activitypub" = bridged from ActivityPub, "atproto" = bridged from AT Protocol.'),
  sort: z.enum(['recent', 'hot', 'trending']).optional().describe('Sort order. "recent" = newest first (default), "hot" = trending recently, "trending" = most popular. Non-recent sorts require Ditto relay.'),
  include_replies: z.boolean().optional().describe('Whether to include reply posts. Default true. Set false to exclude replies and show only top-level posts.'),
});

type Params = z.infer<typeof inputSchema>;

export const CreateSpellTool: Tool<Params> = {
  description: `Create a Nostr spell — a saved query that acts as a custom feed. The spell is published as a kind:777 event and can be added to the sidebar for quick access.

Spells define a Nostr relay filter with optional runtime variables that resolve when executed:
- "$me" expands to the logged-in user's pubkey
- "$contacts" expands to the user's follow list (kind:3 contacts)

Timestamps can be relative durations subtracted from now: "7d" (7 days ago), "2w" (2 weeks), "1mo" (1 month), "1y" (1 year), "24h" (24 hours), or "now" for the current time.

Examples:
- "friends talking about bitcoin" → authors: ["$contacts"], tag_filters: [{letter: "t", values: ["bitcoin"]}]
- "my mass deletions" → authors: ["$me"], kinds: [5]
- "popular zap receipts this week" → kinds: [9735], since: "7d"
- "photos from people I follow" → authors: ["$contacts"], kinds: [20], media: "images"
- "trending posts this week" → since: "7d", sort: "trending"
- "articles mentioning nostr" → kinds: [30023], search: "nostr"
- "english posts from follows" → authors: ["$contacts"], language: "en"`,

  inputSchema,

  async execute(args: Params, ctx: ToolContext): Promise<ToolResult> {
    if (!args.name.trim()) {
      return { result: JSON.stringify({ error: 'A spell name is required.' }) };
    }

    const tags = buildSpellTags({
      name: args.name,
      cmd: args.cmd,
      kinds: args.kinds,
      authors: args.authors,
      tag_filters: args.tag_filters,
      since: args.since,
      until: args.until,
      limit: args.limit,
      search: args.search,
      relays: args.relays,
      media: args.media,
      language: args.language,
      platform: args.platform,
      sort: args.sort,
      includeReplies: args.include_replies,
    });
    const content = args.description ?? '';

    const { sk, pubkey, isBuddy } = getBuddyOrEphemeralKey(ctx.getBuddySecretKey);
    const spellEvent = await signAndPublishWithProfile(
      ctx.nostr, sk, isBuddy,
      { kind: 777, content, tags, created_at: Math.floor(Date.now() / 1000) },
      { name: 'Dork Spellcaster', about: 'Spells created by Dork AI' },
    );

    return {
      result: JSON.stringify({
        success: true,
        event_id: spellEvent.id,
        pubkey,
        name: args.name,
      }),
      nostrEvent: spellEvent,
    };
  },
};
