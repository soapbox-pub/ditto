import { z } from 'zod';
import { finalizeEvent } from 'nostr-tools';

import { BUDDY_KEY_UNAVAILABLE_ERROR, getBuddyKey } from './helpers';

import type { NostrEvent } from '@nostrify/nostrify';
import type { Tool, ToolResult, ToolContext } from './Tool';

const inputSchema = z.object({
  events: z.array(z.object({
    kind: z.number().optional().describe('Event kind number (default: 1).'),
    content: z.string().optional().describe('Event content (default: empty string).'),
    tags: z.array(z.array(z.string())).optional().describe('Event tags (default: empty array).'),
  })).describe('Array of events to publish.'),
});

type Params = z.infer<typeof inputSchema>;

export const PublishEventsTool: Tool<Params> = {
  description: `Publish one or more Nostr events signed by Buddy's identity. Each event can specify a kind, content, and tags. Defaults: kind 1 (text note), empty content, empty tags, current timestamp.

Common kinds: 1 = text note, 6 = repost, 7 = reaction (content is "+" or emoji), 30023 = long-form article.

For text notes (kind 1), put the post text in content. For reactions (kind 7), set content to "+" or an emoji and add an "e" tag referencing the target event.

Tags are arrays of strings, e.g. [["t", "nostr"], ["p", "<hex-pubkey>"]] for a hashtag and a mention.`,

  inputSchema,

  async execute(args: Params, ctx: ToolContext): Promise<ToolResult> {
    if (args.events.length === 0) {
      return { result: JSON.stringify({ error: 'At least one event is required.' }) };
    }

    const buddyKey = getBuddyKey(ctx.getBuddySecretKey);
    if (!buddyKey) {
      return { result: JSON.stringify({ error: BUDDY_KEY_UNAVAILABLE_ERROR }) };
    }

    const currentTimestamp = Math.floor(Date.now() / 1000);

    const finalized: NostrEvent[] = args.events.map((partial) =>
      finalizeEvent({
        kind: partial.kind ?? 1,
        content: partial.content ?? '',
        tags: partial.tags ?? [],
        created_at: currentTimestamp,
      }, buddyKey.sk) as NostrEvent,
    );

    await Promise.all(
      finalized.map((event) => ctx.nostr.event(event, { signal: AbortSignal.timeout(5000) })),
    );

    const displayEvent = finalized.find((e) => e.kind === 1) ?? finalized[0];

    return {
      result: JSON.stringify({
        success: true,
        pubkey: buddyKey.pubkey,
        events_published: finalized.length,
        events: finalized.map((e) => ({
          id: e.id,
          kind: e.kind,
          content: e.content.length > 100 ? `${e.content.slice(0, 100)}...` : e.content,
        })),
      }),
      nostrEvent: displayEvent,
    };
  },
};
