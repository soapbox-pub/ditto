import { useCallback } from 'react';
import { generateSecretKey, getPublicKey, finalizeEvent } from 'nostr-tools';
import { useNostr } from '@nostrify/react';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useTheme } from '@/hooks/useTheme';
import { useAppContext } from '@/hooks/useAppContext';
import { useUploadFile } from '@/hooks/useUploadFile';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useMCPTools } from '@/hooks/useMCPTools';
import { bundledFonts } from '@/lib/fonts';
import { AVAILABLE_FONTS } from '@/lib/aiChatTools';
import { buildSpellTags } from '@/lib/spellEngine';
import { proxyUrl } from '@/lib/proxyUrl';

import type { NostrEvent } from '@nostrify/nostrify';
import type { ThemeConfig } from '@/themes';
import type { ToolExecutorResult } from '@/lib/aiChatTools';
import type { OpenAITool } from '@/lib/MCPClient';

// ─── Helpers ───

/** Simple HSL format check: "H S% L%" where H is 0-360, S and L are 0-100%. */
function isValidHsl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  return /^\d{1,3}\s+\d{1,3}%\s+\d{1,3}%$/.test(value.trim());
}

// ─── Hook ───

export function useAIChatTools() {
  const { applyCustomTheme } = useTheme();
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { config } = useAppContext();
  const { mutateAsync: uploadFile } = useUploadFile();
  const { mutateAsync: publishEvent } = useNostrPublish();
  const { tools: mcpToolDefs, clients: mcpClients, isLoading: mcpLoading } = useMCPTools();

  /** MCP tool definitions in OpenAI format, ready to merge with built-in TOOLS. */
  const mcpTools: OpenAITool[] = Object.values(mcpToolDefs);

  /** Whether MCP tool discovery is still in progress. */
  const mcpToolsLoading = mcpLoading;

  const executeToolCall = useCallback(async (name: string, args: Record<string, unknown>): Promise<ToolExecutorResult> => {
    // Route MCP tool calls (prefixed with `serverName__`) to the appropriate MCPClient.
    if (name.includes('__') && mcpClients[name]) {
      try {
        // Strip the server prefix to get the original tool name for the MCP server.
        const originalName = name.split('__').slice(1).join('__');
        const result = await mcpClients[name].callTool(originalName, args);
        return { result: JSON.stringify({ success: true, content: result }) };
      } catch (err) {
        return { result: JSON.stringify({ error: `MCP tool error: ${err instanceof Error ? err.message : 'Unknown error'}` }) };
      }
    }

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

          // Fetch packs from multiple sources in parallel for best coverage.
          // NIP-50 search may not index tags, so we cast a wide net and
          // title-match client-side.
          const filters: { kinds: number[]; limit: number; search?: string; authors?: string[] }[] = [
            // Broad fetch of recent packs
            { kinds: [39089], limit: 200 },
          ];

          // NIP-50 search (may help on relays that index it)
          filters.push({ kinds: [39089], search: args.query as string, limit: 50 });

          // Also fetch user's own packs
          if (user) {
            filters.push({ kinds: [39089], authors: [user.pubkey], limit: 50 });
          }

          const events = await nostr.query(
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

          // Match on title/name tags
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

          const tags = buildSpellTags({
            name: typeof args.name === 'string' ? args.name : undefined,
            cmd: typeof args.cmd === 'string' ? args.cmd : undefined,
            kinds: Array.isArray(args.kinds) ? args.kinds.filter((k): k is number => typeof k === 'number') : undefined,
            authors: Array.isArray(args.authors) ? args.authors as string[] : undefined,
            tag_filters: Array.isArray(args.tag_filters) ? args.tag_filters as Array<{ letter: string; values: string[] }> : undefined,
            since: typeof args.since === 'string' ? args.since : undefined,
            until: typeof args.until === 'string' ? args.until : undefined,
            limit: typeof args.limit === 'number' ? args.limit : undefined,
            search: typeof args.search === 'string' ? args.search : undefined,
            relays: Array.isArray(args.relays) ? args.relays as string[] : undefined,
            media: typeof args.media === 'string' ? args.media : undefined,
            language: typeof args.language === 'string' ? args.language : undefined,
            platform: typeof args.platform === 'string' ? args.platform : undefined,
            sort: typeof args.sort === 'string' ? args.sort : undefined,
            includeReplies: typeof args.include_replies === 'boolean' ? args.include_replies : undefined,
          });
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

      case 'fetch_page': {
        try {
          const url = typeof args.url === 'string' ? args.url.trim() : '';
          if (!url) {
            return { result: JSON.stringify({ error: 'A URL is required.' }) };
          }

          const proxied = proxyUrl({ template: config.corsProxy, url });
          const response = await fetch(proxied, { signal: AbortSignal.timeout(30_000) });

          if (!response.ok) {
            return { result: JSON.stringify({ error: `Fetch failed: ${response.status} ${response.statusText}` }) };
          }

          const html = await response.text();

          // Extract image URLs from HTML using DOMParser.
          const doc = new DOMParser().parseFromString(html, 'text/html');
          const imgs = Array.from(doc.querySelectorAll('img'));
          const baseUrl = new URL(url);

          const imageUrls: string[] = [];
          for (const img of imgs) {
            const src = img.getAttribute('src');
            if (!src) continue;
            try {
              const absolute = new URL(src, baseUrl).href;
              // Only include common image formats.
              if (/\.(png|jpe?g|gif|webp|svg|bmp|ico|avif)(\?.*)?$/i.test(absolute)) {
                imageUrls.push(absolute);
              }
            } catch {
              // Skip malformed URLs.
            }
          }

          // Deduplicate
          const uniqueImages = [...new Set(imageUrls)];

          // Extract page title
          const title = doc.querySelector('title')?.textContent?.trim() || '';

          return {
            result: JSON.stringify({
              success: true,
              title,
              image_count: uniqueImages.length,
              images: uniqueImages.slice(0, 100),
              text_preview: doc.body?.textContent?.slice(0, 500)?.trim() || '',
            }),
          };
        } catch (err) {
          return { result: JSON.stringify({ error: `Fetch failed: ${err instanceof Error ? err.message : 'Unknown error'}` }) };
        }
      }

      case 'upload_from_url': {
        try {
          if (!user) {
            return { result: JSON.stringify({ error: 'Must be logged in to upload files.' }) };
          }

          const urls = Array.isArray(args.urls) ? (args.urls as string[]).slice(0, 50) : [];
          if (urls.length === 0) {
            return { result: JSON.stringify({ error: 'At least one URL is required.' }) };
          }

          const results: Array<{ original_url: string; blossom_url?: string; shortcode: string; error?: string }> = [];

          for (const imageUrl of urls) {
            try {
              // Fetch image via CORS proxy.
              const proxied = proxyUrl({ template: config.corsProxy, url: imageUrl });
              const response = await fetch(proxied, { signal: AbortSignal.timeout(30_000) });

              if (!response.ok) {
                results.push({ original_url: imageUrl, shortcode: '', error: `HTTP ${response.status}` });
                continue;
              }

              const blob = await response.blob();

              // Derive filename and shortcode from URL path.
              const pathname = new URL(imageUrl).pathname;
              const filename = pathname.split('/').pop() || 'image.png';
              const dotIndex = filename.lastIndexOf('.');
              const baseName = dotIndex > 0 ? filename.slice(0, dotIndex) : filename;
              const shortcode = baseName
                .replace(/[^a-zA-Z0-9_-]/g, '_')
                .replace(/_+/g, '_')
                .replace(/^_|_$/g, '')
                .toLowerCase();

              // Upload to Blossom.
              const file = new File([blob], filename, { type: blob.type || 'image/png' });
              const [[, blossomUrl]] = await uploadFile(file);

              results.push({ original_url: imageUrl, blossom_url: blossomUrl, shortcode: shortcode || 'emoji' });
            } catch (err) {
              results.push({ original_url: imageUrl, shortcode: '', error: err instanceof Error ? err.message : 'Upload failed' });
            }
          }

          const successful = results.filter((r) => r.blossom_url);
          return {
            result: JSON.stringify({
              success: true,
              uploaded: successful.length,
              failed: results.length - successful.length,
              results,
            }),
          };
        } catch (err) {
          return { result: JSON.stringify({ error: `Upload failed: ${err instanceof Error ? err.message : 'Unknown error'}` }) };
        }
      }

      case 'create_emoji_pack': {
        try {
          if (!user) {
            return { result: JSON.stringify({ error: 'Must be logged in to create emoji packs.' }) };
          }

          const packName = typeof args.name === 'string' ? args.name.trim() : '';
          if (!packName) {
            return { result: JSON.stringify({ error: 'A pack name is required.' }) };
          }

          const emojis = Array.isArray(args.emojis) ? args.emojis as Array<{ shortcode: string; url: string }> : [];
          if (emojis.length === 0) {
            return { result: JSON.stringify({ error: 'At least one emoji is required.' }) };
          }

          // Validate shortcodes.
          for (const e of emojis) {
            if (!/^[a-zA-Z0-9_-]+$/.test(e.shortcode)) {
              return { result: JSON.stringify({ error: `Invalid shortcode "${e.shortcode}". Must be alphanumeric with hyphens and underscores only.` }) };
            }
          }

          // Build d-tag slug from pack name.
          const dTag = packName
            .toLowerCase()
            .trim()
            .replace(/[^\w\s-]/g, '')
            .replace(/[\s_]+/g, '-')
            .replace(/^-+|-+$/g, '');

          // Check for d-tag collision.
          const existing = await nostr.query(
            [{ kinds: [30030], authors: [user.pubkey], '#d': [dTag], limit: 1 }],
            { signal: AbortSignal.timeout(5000) },
          );

          if (existing.length > 0) {
            return { result: JSON.stringify({ error: `An emoji pack with slug "${dTag}" already exists. Choose a different name.` }) };
          }

          // Build tags: d-tag, title, then emoji entries.
          const tags: string[][] = [
            ['d', dTag],
            ['title', packName],
            ...emojis.map((e) => ['emoji', e.shortcode, e.url]),
          ];

          await publishEvent({ kind: 30030, content: '', tags });

          return {
            result: JSON.stringify({
              success: true,
              name: packName,
              slug: dTag,
              emoji_count: emojis.length,
            }),
          };
        } catch (err) {
          return { result: JSON.stringify({ error: `Failed to create emoji pack: ${err instanceof Error ? err.message : 'Unknown error'}` }) };
        }
      }

      default:
        return { result: JSON.stringify({ error: `Unknown tool: ${name}` }) };
    }
  }, [applyCustomTheme, nostr, user, mcpClients, config.corsProxy, uploadFile, publishEvent]);

  return { executeToolCall, mcpTools, mcpToolsLoading };
}
