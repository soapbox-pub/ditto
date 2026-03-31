import { useCallback } from 'react';
import { generateSecretKey, getPublicKey, finalizeEvent } from 'nostr-tools';
import { useNostr } from '@nostrify/react';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useTheme } from '@/hooks/useTheme';
import { bundledFonts } from '@/lib/fonts';
import { AVAILABLE_FONTS } from '@/lib/aiChatTools';

import type { NostrEvent } from '@nostrify/nostrify';
import type { ThemeConfig } from '@/themes';
import type { ToolExecutorResult } from '@/lib/aiChatTools';

// ─── Helpers ───

/** Simple HSL format check: "H S% L%" where H is 0-360, S and L are 0-100%. */
function isValidHsl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  return /^\d{1,3}\s+\d{1,3}%\s+\d{1,3}%$/.test(value.trim());
}

/** Build the kind:777 tags array from create_spell tool arguments. */
function buildSpellTags(args: Record<string, unknown>): string[][] {
  const tags: string[][] = [];

  if (typeof args.name === 'string') tags.push(['name', args.name]);

  const cmd = typeof args.cmd === 'string' ? args.cmd : 'REQ';
  tags.push(['cmd', cmd]);

  if (Array.isArray(args.kinds)) {
    for (const k of args.kinds) {
      if (typeof k === 'number') tags.push(['k', String(k)]);
    }
  }

  if (Array.isArray(args.authors)) {
    tags.push(['authors', ...(args.authors as string[])]);
  }

  if (Array.isArray(args.tag_filters)) {
    for (const tf of args.tag_filters as Array<{ letter: string; values: string[] }>) {
      if (tf.letter && Array.isArray(tf.values)) {
        tags.push(['tag', tf.letter, ...tf.values]);
      }
    }
  }

  if (typeof args.since === 'string') tags.push(['since', args.since]);
  if (typeof args.until === 'string') tags.push(['until', args.until]);
  if (typeof args.limit === 'number') tags.push(['limit', String(args.limit)]);
  if (typeof args.search === 'string') tags.push(['search', args.search]);

  if (Array.isArray(args.relays) && args.relays.length > 0) {
    tags.push(['relays', ...(args.relays as string[])]);
  }

  tags.push(['alt', `Spell: ${args.name ?? 'unnamed'}`]);

  return tags;
}

// ─── Hook ───

export function useAIChatTools() {
  const { applyCustomTheme } = useTheme();
  const { nostr } = useNostr();
  const { user } = useCurrentUser();

  const executeToolCall = useCallback(async (name: string, args: Record<string, unknown>): Promise<ToolExecutorResult> => {
    switch (name) {
      case 'set_theme': {
        const { background, text, primary, font, background_url, background_mode } = args;

        // Validate required color values
        if (!isValidHsl(background) || !isValidHsl(text) || !isValidHsl(primary)) {
          return { result: JSON.stringify({
            error: 'Invalid HSL color values. Each must be a string like "228 20% 10%".',
            received: { background, text, primary },
          }) };
        }

        // Build theme config
        const themeConfig: ThemeConfig = {
          colors: {
            background: background as string,
            text: text as string,
            primary: primary as string,
          },
        };

        // Add font if provided
        if (typeof font === 'string' && font.trim()) {
          const bundled = bundledFonts.find((f) => f.family.toLowerCase() === font.trim().toLowerCase());
          if (bundled) {
            themeConfig.font = { family: bundled.family };
          } else {
            return { result: JSON.stringify({
              error: `Unknown font "${font}". Available fonts: ${AVAILABLE_FONTS}`,
            }) };
          }
        }

        // Add background if provided
        if (typeof background_url === 'string' && background_url.trim()) {
          themeConfig.background = {
            url: background_url.trim(),
            mode: background_mode === 'tile' ? 'tile' : 'cover',
          };
        }

        applyCustomTheme(themeConfig);

        // Build result summary
        const resultData: Record<string, unknown> = {
          success: true,
          colors: { background, text, primary },
        };
        if (themeConfig.font) resultData.font = themeConfig.font.family;
        if (themeConfig.background) resultData.background = { url: themeConfig.background.url, mode: themeConfig.background.mode };

        return { result: JSON.stringify(resultData) };
      }

      case 'search_users': {
        try {
          const query = typeof args.query === 'string' ? args.query.trim().toLowerCase() : '';
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
          if (user) {
            const contactEvents = await nostr.query(
              [{ kinds: [3], authors: [user.pubkey], limit: 1 }],
              { signal: AbortSignal.timeout(5000) },
            );

            const contactPubkeys = contactEvents[0]?.tags
              .filter(([t]) => t === 'p')
              .map(([, pk]) => pk) ?? [];

            if (contactPubkeys.length > 0) {
              // Fetch metadata for contacts in batches
              const batchSize = 100;
              for (let i = 0; i < contactPubkeys.length && matches.length < 5; i += batchSize) {
                const batch = contactPubkeys.slice(i, i + batchSize);
                const metaEvents = await nostr.query(
                  [{ kinds: [0], authors: batch }],
                  { signal: AbortSignal.timeout(8000) },
                );

                for (const event of metaEvents) {
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
            }
          }

          // Phase 2: NIP-50 relay search (if contacts didn't yield enough results)
          if (matches.length < 3) {
            try {
              const searchEvents = await nostr.query(
                [{ kinds: [0], search: args.query as string, limit: 10 }],
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

          // Return top 5
          const results = matches.slice(0, 5);

          if (results.length === 0) {
            return { result: JSON.stringify({ matches: [], message: `No users found matching "${args.query}". The user may need to provide an npub or NIP-05 address.` }) };
          }

          return { result: JSON.stringify({ matches: results }) };
        } catch (err) {
          return { result: JSON.stringify({ error: `Search failed: ${err instanceof Error ? err.message : 'Unknown error'}` }) };
        }
      }

      case 'search_follow_packs': {
        try {
          const query = typeof args.query === 'string' ? args.query.trim().toLowerCase() : '';
          if (!query) {
            return { result: JSON.stringify({ error: 'A search query is required.' }) };
          }

          // Search for follow packs by title using NIP-50 full-text search
          const events = await nostr.query(
            [{ kinds: [39089], search: args.query as string, limit: 20 }],
            { signal: AbortSignal.timeout(8000) },
          );

          // Also try a broader query without search (for relays that don't support NIP-50)
          let allEvents = [...events];
          if (events.length < 3) {
            const broadEvents = await nostr.query(
              [{ kinds: [39089], limit: 50 }],
              { signal: AbortSignal.timeout(8000) },
            );
            // Deduplicate by event id
            const seen = new Set(allEvents.map((e) => e.id));
            for (const e of broadEvents) {
              if (!seen.has(e.id)) allEvents.push(e);
            }
          }

          // Match on title/name tags
          interface PackMatch {
            title: string;
            description?: string;
            member_count: number;
            pubkeys: string[];
            author: string;
          }

          const matches: PackMatch[] = [];

          for (const event of allEvents) {
            const title = (event.tags.find(([t]) => t === 'title')?.[1]
              ?? event.tags.find(([t]) => t === 'name')?.[1]
              ?? '').trim();

            if (!title) continue;

            // Check if the title matches the query
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

          // Sort by relevance: exact match first, then by member count
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
        } catch (err) {
          return { result: JSON.stringify({ error: `Search failed: ${err instanceof Error ? err.message : 'Unknown error'}` }) };
        }
      }

      case 'create_spell': {
        try {
          if (typeof args.name !== 'string' || !args.name.trim()) {
            return { result: JSON.stringify({ error: 'A spell name is required.' }) };
          }

          const tags = buildSpellTags(args);
          const content = typeof args.description === 'string' ? args.description : '';

          // Generate ephemeral keypair
          const sk = generateSecretKey();
          const pubkey = getPublicKey(sk);

          // Finalize and sign with ephemeral key
          const spellEvent = finalizeEvent({
            kind: 777,
            content,
            tags,
            created_at: Math.floor(Date.now() / 1000),
          }, sk) as NostrEvent;

          // Publish a minimal kind:0 profile so the ephemeral key has an identity
          const profileEvent = finalizeEvent({
            kind: 0,
            content: JSON.stringify({ name: 'Dork Spellcaster', about: 'Spells created by Dork AI' }),
            tags: [],
            created_at: Math.floor(Date.now() / 1000),
          }, sk) as NostrEvent;

          await Promise.all([
            nostr.event(profileEvent, { signal: AbortSignal.timeout(5000) }),
            nostr.event(spellEvent, { signal: AbortSignal.timeout(5000) }),
          ]);

          return {
            result: JSON.stringify({
              success: true,
              event_id: spellEvent.id,
              pubkey,
              name: args.name,
            }),
            nostrEvent: spellEvent,
          };
        } catch (err) {
          return { result: JSON.stringify({
            error: `Failed to publish spell: ${err instanceof Error ? err.message : 'Unknown error'}`,
          }) };
        }
      }

      default:
        return { result: JSON.stringify({ error: `Unknown tool: ${name}` }) };
    }
  }, [applyCustomTheme, nostr, user]);

  return { executeToolCall };
}
