import { useCallback } from 'react';
import { generateSecretKey, getPublicKey, finalizeEvent, nip19 } from 'nostr-tools';
import { zipSync, strToU8 } from 'fflate';
import { NSecSigner } from '@nostrify/nostrify';
import { BlossomUploader } from '@nostrify/nostrify/uploaders';
import { useNostr } from '@nostrify/react';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useBuddy } from '@/hooks/useBuddy';
import { useTheme } from '@/hooks/useTheme';
import { useAppContext } from '@/hooks/useAppContext';
import { useSavedFeeds } from '@/hooks/useSavedFeeds';
import { useScreenEffect } from '@/contexts/ScreenEffectContext';
import { bundledFonts } from '@/lib/fonts';
import { AVAILABLE_FONTS } from '@/lib/aiChatTools';
import { buildSpellTags, buildUnsignedSpell, resolveSpell } from '@/lib/spellEngine';
import { proxyUrl } from '@/lib/proxyUrl';
import { getEffectiveBlossomServers } from '@/lib/appBlossom';
import { DITTO_RELAYS } from '@/lib/appRelays';

import type { NostrEvent, NostrFilter, NostrSigner } from '@nostrify/nostrify';
import type { ThemeConfig } from '@/themes';
import type { ToolExecutorResult } from '@/lib/aiChatTools';

// ─── Helpers ───

/** Simple HSL format check: "H S% L%" where H is 0-360, S and L are 0-100%. */
function isValidHsl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  return /^\d{1,3}\s+\d{1,3}%\s+\d{1,3}%$/.test(value.trim());
}

/** Get the buddy secret key or generate an ephemeral one. */
function getBuddyOrEphemeralKey(getBuddySecretKey: () => Uint8Array | null) {
  const buddySk = getBuddySecretKey();
  const sk = buddySk ?? generateSecretKey();
  return { sk, pubkey: getPublicKey(sk), isBuddy: !!buddySk };
}

/**
 * Sign and publish a Nostr event, plus a throwaway kind-0 profile when using
 * an ephemeral key (buddy already has a profile).
 */
async function signAndPublishWithProfile(
  nostr: { event: (event: NostrEvent, opts?: { signal?: AbortSignal }) => Promise<void> },
  sk: Uint8Array,
  isBuddy: boolean,
  event: { kind: number; content: string; tags: string[][]; created_at: number },
  profileMeta: { name: string; about: string },
): Promise<NostrEvent> {
  const signed = finalizeEvent(event, sk) as NostrEvent;
  const publishes: Promise<void>[] = [
    nostr.event(signed, { signal: AbortSignal.timeout(5000) }),
  ];
  if (!isBuddy) {
    const profileEvent = finalizeEvent({
      kind: 0,
      content: JSON.stringify(profileMeta),
      tags: [],
      created_at: event.created_at,
    }, sk) as NostrEvent;
    publishes.push(nostr.event(profileEvent, { signal: AbortSignal.timeout(5000) }));
  }
  await Promise.all(publishes);
  return signed;
}

/** Create a BlossomUploader configured with buddy or user signer. */
function createBuddyUploader(
  getBuddySecretKey: () => Uint8Array | null,
  userSigner: NostrSigner,
  servers: string[],
): BlossomUploader {
  const buddySk = getBuddySecretKey();
  const signer = buddySk ? new NSecSigner(buddySk) : userSigner;
  return new BlossomUploader({
    servers,
    signer,
    fetch: (input, init) => globalThis.fetch(input, {
      ...init,
      signal: AbortSignal.any([
        init?.signal ?? AbortSignal.timeout(30_000),
        AbortSignal.timeout(30_000),
      ]),
    }),
  });
}

// ─── Hook ───

export function useAIChatTools() {
  const { applyCustomTheme } = useTheme();
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { config } = useAppContext();
  const { savedFeeds } = useSavedFeeds();
  const { setScreenEffect } = useScreenEffect();

  const { getBuddySecretKey } = useBuddy();

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
              // Fetch metadata for all contacts in a single query
              const metaEvents = await nostr.query(
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

          const { sk, pubkey, isBuddy } = getBuddyOrEphemeralKey(getBuddySecretKey);
          const spellEvent = await signAndPublishWithProfile(
            nostr, sk, isBuddy,
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

          const servers = getEffectiveBlossomServers(config.blossomServerMetadata, config.useAppBlossomServers);
          const uploader = createBuddyUploader(getBuddySecretKey, user.signer, servers);

          const results: Array<{ original_url: string; blossom_url?: string; shortcode: string; mime_type?: string; error?: string }> = [];

          for (const fileUrl of urls) {
            try {
              // Fetch file via CORS proxy.
              const proxied = proxyUrl({ template: config.corsProxy, url: fileUrl });
              const response = await fetch(proxied, { signal: AbortSignal.timeout(30_000) });

              if (!response.ok) {
                results.push({ original_url: fileUrl, shortcode: '', error: `HTTP ${response.status}` });
                continue;
              }

              const blob = await response.blob();

              // Derive filename and shortcode from URL path.
              const pathname = new URL(fileUrl).pathname;
              const filename = pathname.split('/').pop() || 'file';
              const dotIndex = filename.lastIndexOf('.');
              const baseName = dotIndex > 0 ? filename.slice(0, dotIndex) : filename;
              const ext = dotIndex > 0 ? filename.slice(dotIndex + 1).toLowerCase() : '';
              const shortcode = baseName
                .replace(/[^a-zA-Z0-9_-]/g, '_')
                .replace(/_+/g, '_')
                .replace(/^_|_$/g, '')
                .toLowerCase();

              // Resolve MIME type: prefer the response content-type, then
              // fall back to extension-based lookup, then octet-stream.
              const MIME_BY_EXT: Record<string, string> = {
                xdc: 'application/x-webxdc',
                zip: 'application/zip',
                png: 'image/png',
                jpg: 'image/jpeg',
                jpeg: 'image/jpeg',
                gif: 'image/gif',
                webp: 'image/webp',
                svg: 'image/svg+xml',
                mp4: 'video/mp4',
                webm: 'video/webm',
                mp3: 'audio/mpeg',
                ogg: 'audio/ogg',
                pdf: 'application/pdf',
                json: 'application/json',
              };
              const mimeType = blob.type && blob.type !== 'application/octet-stream'
                ? blob.type
                : MIME_BY_EXT[ext] ?? 'application/octet-stream';

              // Upload to Blossom with buddy or user signer.
              const file = new File([blob], filename, { type: mimeType });
              const tags = await uploader.upload(file);
              const blossomUrl = tags[0][1];

              results.push({ original_url: fileUrl, blossom_url: blossomUrl, shortcode: shortcode || 'file', mime_type: mimeType });
            } catch (err) {
              results.push({ original_url: fileUrl, shortcode: '', error: err instanceof Error ? err.message : 'Upload failed' });
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

          // Build tags: d-tag, title, then emoji entries.
          const tags: string[][] = [
            ['d', dTag],
            ['title', packName],
            ...emojis.map((e) => ['emoji', e.shortcode, e.url]),
          ];

          const { sk, pubkey, isBuddy } = getBuddyOrEphemeralKey(getBuddySecretKey);
          const emojiPackEvent = await signAndPublishWithProfile(
            nostr, sk, isBuddy,
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
              emoji_count: emojis.length,
            }),
            nostrEvent: emojiPackEvent,
          };
        } catch (err) {
          return { result: JSON.stringify({ error: `Failed to create emoji pack: ${err instanceof Error ? err.message : 'Unknown error'}` }) };
        }
      }

      case 'publish_events': {
        try {
          const events = Array.isArray(args.events)
            ? args.events as Array<{ kind?: number; content?: string; tags?: string[][] }>
            : [];
          if (events.length === 0) {
            return { result: JSON.stringify({ error: 'At least one event is required.' }) };
          }

          const { sk, pubkey, isBuddy } = getBuddyOrEphemeralKey(getBuddySecretKey);
          const currentTimestamp = Math.floor(Date.now() / 1000);

          const finalized: NostrEvent[] = events.map((partial) =>
            finalizeEvent({
              kind: partial.kind ?? 1,
              content: partial.content ?? '',
              tags: partial.tags ?? [],
              created_at: currentTimestamp,
            }, sk) as NostrEvent,
          );

          // Publish ephemeral profile first (if needed), then all events
          if (!isBuddy) {
            const profileEvent = finalizeEvent({
              kind: 0,
              content: JSON.stringify({ name: 'Dork Publisher', about: 'Events published by Dork AI' }),
              tags: [],
              created_at: currentTimestamp,
            }, sk) as NostrEvent;
            await nostr.event(profileEvent, { signal: AbortSignal.timeout(5000) });
          }

          await Promise.all(
            finalized.map((event) => nostr.event(event, { signal: AbortSignal.timeout(5000) })),
          );

          // Return the first event for inline display if it's a kind 1
          const displayEvent = finalized.find((e) => e.kind === 1) ?? finalized[0];

          return {
            result: JSON.stringify({
              success: true,
              pubkey,
              events_published: finalized.length,
              events: finalized.map((e) => ({
                id: e.id,
                kind: e.kind,
                content: e.content.length > 100 ? `${e.content.slice(0, 100)}...` : e.content,
              })),
            }),
            nostrEvent: displayEvent,
          };
        } catch (err) {
          return { result: JSON.stringify({ error: `Failed to publish events: ${err instanceof Error ? err.message : 'Unknown error'}` }) };
        }
      }

      case 'fetch_event': {
        try {
          const identifier = typeof args.identifier === 'string' ? args.identifier.trim() : '';
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
              const events = await nostr.query(
                [{ kinds: [0], authors: [decoded.data], limit: 1 }],
                { signal: AbortSignal.timeout(8000) },
              );
              event = events[0];
              break;
            }
            case 'nprofile': {
              const events = await nostr.query(
                [{ kinds: [0], authors: [decoded.data.pubkey], limit: 1 }],
                { signal: AbortSignal.timeout(8000) },
              );
              event = events[0];
              break;
            }
            case 'note': {
              const events = await nostr.query(
                [{ ids: [decoded.data] }],
                { signal: AbortSignal.timeout(8000) },
              );
              event = events[0];
              break;
            }
            case 'nevent': {
              const events = await nostr.query(
                [{ ids: [decoded.data.id] }],
                { signal: AbortSignal.timeout(8000) },
              );
              event = events[0];
              break;
            }
            case 'naddr': {
              const events = await nostr.query(
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
        } catch (err) {
          return { result: JSON.stringify({ error: `Failed to fetch event: ${err instanceof Error ? err.message : 'Unknown error'}` }) };
        }
      }

      case 'get_feed': {
        try {
          const feedName = typeof args.feed_name === 'string' ? args.feed_name.trim().toLowerCase() : '';
          const country = typeof args.country === 'string' ? args.country.trim().toUpperCase() : '';
          const hours = Math.min(Math.max(1, typeof args.hours === 'number' ? args.hours : 12), 168);
          const limit = Math.min(Math.max(1, typeof args.limit === 'number' ? args.limit : 50), 100);
          const sinceTimestamp = Math.floor(Date.now() / 1000) - hours * 3600;

          // Fetch user's contacts for resolving $contacts and the follows feed.
          let contactPubkeys: string[] = [];
          if (user) {
            try {
              const contactEvents = await nostr.query(
                [{ kinds: [3], authors: [user.pubkey], limit: 1 }],
                { signal: AbortSignal.timeout(5000) },
              );
              contactPubkeys = contactEvents[0]?.tags
                .filter(([t]) => t === 'p')
                .map(([, pk]) => pk) ?? [];
            } catch {
              // Contacts unavailable — continue without them
            }
          }

          let filter: NostrFilter;
          let needsDittoRelay = false;
          let feedLabel = '';

          if (country) {
            // Country feed — NIP-73 geographic comments
            filter = {
              kinds: [1111],
              '#I': [`iso3166:${country}`],
              since: sinceTimestamp,
              limit,
            } as NostrFilter;
            feedLabel = `country: ${country}`;
          } else if (feedName === 'follows') {
            if (!user) {
              return { result: JSON.stringify({ error: 'Must be logged in to read the follows feed.' }) };
            }
            const authors = [user.pubkey, ...contactPubkeys];
            if (authors.length <= 1) {
              return { result: JSON.stringify({ error: 'The user is not following anyone yet.' }) };
            }
            filter = { kinds: [1], authors, since: sinceTimestamp, limit };
            feedLabel = 'follows';
          } else if (feedName === 'global') {
            filter = { kinds: [1], since: sinceTimestamp, limit };
            feedLabel = 'global';
          } else if (feedName === 'ditto') {
            filter = { kinds: [1], since: sinceTimestamp, limit, search: 'sort:hot protocol:nostr' };
            needsDittoRelay = true;
            feedLabel = 'ditto (hot)';
          } else if (feedName) {
            // Look up a saved feed by label
            const match = savedFeeds.find((f) => f.label.toLowerCase() === feedName);
            if (!match) {
              const available = savedFeeds.map((f) => f.label).join(', ');
              return {
                result: JSON.stringify({
                  error: `No saved feed named "${args.feed_name}".`,
                  available_feeds: available ? `follows, global, ditto, ${available}` : 'follows, global, ditto',
                }),
              };
            }
            try {
              const resolved = resolveSpell(match.spell, user?.pubkey, contactPubkeys);
              filter = { ...resolved.filter, since: sinceTimestamp, limit };
              needsDittoRelay = resolved.needsDittoRelay;
              feedLabel = match.label;
            } catch (err) {
              return { result: JSON.stringify({ error: `Failed to resolve saved feed "${match.label}": ${err instanceof Error ? err.message : 'Unknown error'}` }) };
            }
          } else {
            // Ad-hoc query — build a spell from the inline params
            const spellArgs: Parameters<typeof buildSpellTags>[0] = {
              name: 'ad-hoc',
              kinds: Array.isArray(args.kinds) ? (args.kinds as number[]).filter((k) => typeof k === 'number') : undefined,
              authors: Array.isArray(args.authors) ? args.authors as string[] : undefined,
              search: typeof args.search === 'string' ? args.search : undefined,
            };

            if (typeof args.hashtag === 'string' && args.hashtag.trim()) {
              spellArgs.tag_filters = [{ letter: 't', values: [args.hashtag.trim().toLowerCase()] }];
            }

            const tags = buildSpellTags(spellArgs);
            const unsigned = buildUnsignedSpell(tags);

            try {
              const resolved = resolveSpell(unsigned, user?.pubkey, contactPubkeys);
              filter = { ...resolved.filter, since: sinceTimestamp, limit };
              // Default to kind 1 if no kinds specified
              if (!filter.kinds) filter.kinds = [1];
              needsDittoRelay = resolved.needsDittoRelay;
              feedLabel = args.search ? `search: ${args.search}` : args.hashtag ? `#${args.hashtag}` : 'ad-hoc';
            } catch (err) {
              return { result: JSON.stringify({ error: `Failed to resolve query: ${err instanceof Error ? err.message : 'Unknown error'}` }) };
            }
          }

          // Query relays
          const store = needsDittoRelay ? nostr.group(DITTO_RELAYS) : nostr;
          const events = await store.query(
            [filter],
            { signal: AbortSignal.timeout(10000) },
          );

          // Sort newest first
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

          // Batch-fetch author profiles for display names
          const uniquePubkeys = [...new Set(sorted.map((e) => e.pubkey))];
          const profileMap = new Map<string, { name?: string; display_name?: string; nip05?: string }>();

          try {
            const profiles = await nostr.query(
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

          // Format results as readable text
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

          return {
            result: JSON.stringify({
              success: true,
              feed: feedLabel,
              hours,
              post_count: sorted.length,
              data: text,
            }),
          };
        } catch (err) {
          if (err instanceof Error && err.name === 'AbortError') {
            return { result: JSON.stringify({ error: 'Request timed out. Try reducing the time window or limit.' }) };
          }
          return { result: JSON.stringify({ error: `Failed to fetch feed: ${err instanceof Error ? err.message : 'Unknown error'}` }) };
        }
      }

      case 'create_webxdc': {
        try {
          if (!user) {
            return { result: JSON.stringify({ error: 'Must be logged in to create a WebXDC app.' }) };
          }

          const appName = typeof args.name === 'string' ? args.name.trim() : '';
          const html = typeof args.html === 'string' ? args.html : '';
          const filesMap = (args.files && typeof args.files === 'object' && !Array.isArray(args.files))
            ? args.files as Record<string, string>
            : null;
          const description = typeof args.description === 'string' ? args.description.trim() : '';

          if (!appName) {
            return { result: JSON.stringify({ error: 'An app name is required.' }) };
          }
          if (!filesMap && !html) {
            return { result: JSON.stringify({ error: 'Either "html" or "files" is required.' }) };
          }

          // Build the .xdc archive in memory using fflate
          const manifest = `name = "${appName.replace(/"/g, '\\"')}"\n`;
          const entries: Record<string, Uint8Array> = {
            'manifest.toml': strToU8(manifest),
          };

          if (filesMap) {
            for (const [filename, content] of Object.entries(filesMap)) {
              if (typeof content === 'string') {
                entries[filename] = strToU8(content);
              }
            }
            if (!entries['index.html']) {
              return { result: JSON.stringify({ error: 'The "files" map must include an "index.html" entry.' }) };
            }
          } else if (html) {
            entries['index.html'] = strToU8(html);
          }

          // Fetch binary assets from URLs and add to the archive
          const assetUrls = (args.asset_urls && typeof args.asset_urls === 'object' && !Array.isArray(args.asset_urls))
            ? args.asset_urls as Record<string, string>
            : null;

          if (assetUrls) {
            const assetEntries = await Promise.all(
              Object.entries(assetUrls)
                .filter(([, url]) => typeof url === 'string' && url.trim())
                .map(async ([filename, url]) => {
                  const res = await globalThis.fetch(url, { signal: AbortSignal.timeout(60_000) });
                  if (!res.ok) throw new Error(`Failed to fetch asset "${filename}" from ${url}: ${res.status}`);
                  return [filename, new Uint8Array(await res.arrayBuffer())] as const;
                }),
            );
            for (const [filename, bytes] of assetEntries) {
              entries[filename] = bytes;
            }
          }

          if (!entries['index.html']) {
            return { result: JSON.stringify({ error: 'An "index.html" entry is required. Provide "html", or include "index.html" in "files".' }) };
          }

          const zipped = zipSync(entries);

          // Create a File from the ZIP bytes
          const slug = appName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
          const xdcFile = new File([zipped], `${slug}.xdc`, { type: 'application/x-webxdc' });

          // Upload to Blossom
          const servers = getEffectiveBlossomServers(config.blossomServerMetadata, config.useAppBlossomServers);
          const uploader = createBuddyUploader(getBuddySecretKey, user.signer, servers);

          const uploadTags = await uploader.upload(xdcFile);
          let blossomUrl = uploadTags[0][1];

          // Ensure URL ends with .xdc
          if (!blossomUrl.endsWith('.xdc')) {
            blossomUrl = blossomUrl + '.xdc';
          }

          // Build the kind 1063 event tags
          const uuid = crypto.randomUUID();
          const eventTags: string[][] = [
            ['url', blossomUrl],
            ['m', 'application/x-webxdc'],
            ['alt', `Webxdc app: ${appName}`],
            ['webxdc', uuid],
          ];

          // Add hash tags from upload
          const hashTag = uploadTags.find(t => t[0] === 'x');
          if (hashTag) eventTags.push(['x', hashTag[1]]);

          const oxTag = uploadTags.find(t => t[0] === 'ox');
          if (oxTag) eventTags.push(['ox', oxTag[1]]);

          // Add file size
          const sizeTag = uploadTags.find(t => t[0] === 'size');
          if (sizeTag) eventTags.push(['size', sizeTag[1]]);

          // Add icon/thumbnail image if provided
          const imageUrl = typeof args.image_url === 'string' ? args.image_url.trim() : '';
          if (imageUrl) eventTags.push(['image', imageUrl]);

          // Sign and publish the kind 1063 event
          const { sk, pubkey, isBuddy } = getBuddyOrEphemeralKey(getBuddySecretKey);
          const webxdcEvent = await signAndPublishWithProfile(
            nostr, sk, isBuddy,
            { kind: 1063, content: description || appName, tags: eventTags, created_at: Math.floor(Date.now() / 1000) },
            { name: 'Dork App Maker', about: 'WebXDC apps created by Dork AI' },
          );

          return {
            result: JSON.stringify({
              success: true,
              event_id: webxdcEvent.id,
              pubkey,
              name: appName,
              url: blossomUrl,
              size: xdcFile.size,
            }),
            nostrEvent: webxdcEvent,
          };
        } catch (err) {
          return { result: JSON.stringify({ error: `Failed to create WebXDC app: ${err instanceof Error ? err.message : 'Unknown error'}` }) };
        }
      }

      case 'make_it_rain': {
        const action = typeof args.action === 'string' ? args.action : 'start';

        if (action === 'stop') {
          setScreenEffect(null);
          return { result: JSON.stringify({ success: true, message: 'Screen effect stopped.' }) };
        }

        const effectType = (args.type === 'snow' ? 'snow' : 'rain') as 'rain' | 'snow';
        const intensity = (['light', 'moderate', 'heavy'].includes(args.intensity as string)
          ? args.intensity
          : 'moderate') as 'light' | 'moderate' | 'heavy';

        setScreenEffect({ type: effectType, intensity });

        const label = `${intensity} ${effectType}`;
        return { result: JSON.stringify({ success: true, message: `${label} effect activated!` }) };
      }

      default:
        return { result: JSON.stringify({ error: `Unknown tool: ${name}` }) };
    }
  }, [applyCustomTheme, nostr, user, config, getBuddySecretKey, savedFeeds, setScreenEffect]);

  return { executeToolCall, savedFeeds };
}
