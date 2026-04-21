import { z } from 'zod';

import { sanitizeUrl } from '@/lib/sanitizeUrl';

import { getBuddyOrEphemeralKey, signAndPublishWithProfile } from './helpers';

import type { Tool, ToolResult, ToolContext } from './Tool';

const inputSchema = z.object({
  name: z.string().describe('Human-readable name for the emoji pack (e.g. "AIM Emoticons", "Retro Smileys").'),
  emojis: z.array(z.object({
    shortcode: z.string().describe('Shortcode for the emoji (alphanumeric, hyphens, underscores). E.g. "smiley", "heart-eyes".'),
    url: z.string().describe('URL to the emoji image (should be a Blossom URL).'),
  })).describe('Array of emoji entries to include in the pack.'),
});

type Params = z.infer<typeof inputSchema>;

export const CreateEmojiPackTool: Tool<Params> = {
  description: `Create and publish a NIP-30 custom emoji pack (kind 30030 event). The pack is published as the logged-in user.

Takes a pack name and an array of emoji entries (shortcode + image URL). Shortcodes must be alphanumeric with hyphens and underscores only. The image URLs should be Blossom URLs from a prior upload_from_url call.

After publishing, the emoji pack appears in the user's feed and can be added to their emoji collection.`,

  inputSchema,

  async execute(args: Params, ctx: ToolContext): Promise<ToolResult> {
    const packName = args.name.trim();
    if (!packName) {
      return { result: JSON.stringify({ error: 'A pack name is required.' }) };
    }

    if (args.emojis.length === 0) {
      return { result: JSON.stringify({ error: 'At least one emoji is required.' }) };
    }

    for (const e of args.emojis) {
      if (!/^[a-zA-Z0-9_-]+$/.test(e.shortcode)) {
        return { result: JSON.stringify({ error: `Invalid shortcode "${e.shortcode}". Must be alphanumeric with hyphens and underscores only.` }) };
      }
    }

    // Sanitize emoji URLs -- reject any that aren't valid HTTPS
    const sanitizedEmojis = args.emojis
      .map((e) => ({ shortcode: e.shortcode, url: sanitizeUrl(e.url) }))
      .filter((e): e is { shortcode: string; url: string } => !!e.url);

    if (sanitizedEmojis.length === 0) {
      return { result: JSON.stringify({ error: 'No emojis had valid HTTPS URLs. All emoji image URLs must be HTTPS.' }) };
    }

    const dTag = packName
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_]+/g, '-')
      .replace(/^-+|-+$/g, '');

    const tags: string[][] = [
      ['d', dTag],
      ['title', packName],
      ...sanitizedEmojis.map((e) => ['emoji', e.shortcode, e.url]),
    ];

    const { sk, pubkey, isBuddy } = getBuddyOrEphemeralKey(ctx.getBuddySecretKey);
    const emojiPackEvent = await signAndPublishWithProfile(
      ctx.nostr, sk, isBuddy,
      { kind: 30030, content: '', tags, created_at: Math.floor(Date.now() / 1000) },
      { name: 'Dork Emoji Maker', about: 'Emoji packs created by Dork AI' },
    );

    return {
      result: JSON.stringify({
        success: true,
        event_id: emojiPackEvent.id,
        pubkey,
        name: packName,
        slug: dTag,
        emoji_count: sanitizedEmojis.length,
      }),
      nostrEvent: emojiPackEvent,
    };
  },
};
