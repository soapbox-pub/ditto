import { z } from 'zod';
import { zipSync, strToU8 } from 'fflate';

import { sanitizeUrl } from '@/lib/sanitizeUrl';

import { BUDDY_KEY_UNAVAILABLE_ERROR, getBuddyKey, signAndPublishAsBuddy, createBuddyUploader } from './helpers';
import { sanitizeToolFetchUrl } from './sanitizeToolFetchUrl';

import type { Tool, ToolResult, ToolContext } from './Tool';

const inputSchema = z.object({
  name: z.string().describe('Human-readable app name (e.g. "Pong", "Snake", "Tic Tac Toe").'),
  html: z.string().optional().describe('Complete HTML source code for a single-file app. Must be a full HTML document with <!DOCTYPE html>. Ignored if "files" is provided.'),
  files: z.record(z.string(), z.string()).optional().describe('Map of filenames to text content for multi-file apps. Must include "index.html". Other files (e.g. "game.js", "style.css") are loaded via relative paths.'),
  asset_urls: z.record(z.string(), z.string()).optional().describe('Map of filenames to remote URLs for binary assets to bundle into the archive. Each URL is fetched and included as a raw file.'),
  description: z.string().optional().describe('Optional short description of the app.'),
  image_url: z.string().optional().describe('Optional icon/thumbnail image URL for the app card in the feed.'),
});

type Params = z.infer<typeof inputSchema>;

/** Only allow simple relative paths — no traversal, no absolute paths, no backslashes. */
const SAFE_FILENAME = /^[a-zA-Z0-9_-][a-zA-Z0-9_./-]*$/;

function isSafeFilename(name: string): boolean {
  if (!name || !SAFE_FILENAME.test(name)) return false;
  // Reject path traversal and absolute paths
  const segments = name.split('/');
  return segments.every((s) => s !== '..' && s !== '' && s !== '.');
}

export const CreateWebxdcTool: Tool<Params> = {
  description: `Create and publish a WebXDC mini-app. WebXDC apps are self-contained HTML5 apps (games, tools, widgets) that run inside a sandboxed iframe with no internet access.

You provide the app name and source code. The tool handles everything else: packaging into a .xdc archive, uploading to Blossom, and publishing as a kind 1063 Nostr event that other users can launch directly from their feed.

The Blossom upload and published Nostr event are signed by Buddy's identity.

**Two modes for source code:**
- **Simple (html param):** Provide a single self-contained HTML string. Best for small apps.
- **Multi-file (files param):** Provide a map of filenames to content strings. The archive can contain index.html plus separate .js, .css, .json, or .svg files. index.html loads them via relative paths (e.g. <script src="game.js">). Use this when the code is large enough that splitting into separate files improves clarity.

Only one of html or files is needed. If both are provided, files takes priority.

**Binary assets (asset_urls param, optional):** Include remote files as binary assets in the archive. Map filenames to Blossom URLs (from prior upload_from_url calls). Each URL is fetched and bundled into the .xdc. The app loads them via relative paths (e.g. fetch("game.gb"), new Audio("sfx.wav")). Works for ROMs, images, audio, WASM, fonts, or any binary content.

**Important constraints:**
- NO external resources: no CDN links, no external CSS/JS, no Google Fonts
- NO ES module imports — use plain <script> tags only
- All assets (images, sounds) must be generated procedurally (canvas drawing, CSS shapes, Web Audio API) or embedded as data: URIs
- The sandbox blocks all external network access — remote requests silently fail
- fetch() to relative paths within the archive DOES work; localStorage is available and scoped to the app

**Input handling:**
- The host app provides a built-in virtual gamepad — do NOT build touch controls or on-screen gamepads
- Only use keydown/keyup listeners. The host gamepad maps to: ArrowUp/Down/Left/Right for D-pad, x (88) = A, z (90) = B, Enter (13) = Start, Shift (16) = Select
- Fill the entire viewport with the app canvas — no space needed for controls

**Good patterns:**
- Canvas-based games (pong, snake, tetris, breakout, etc.)
- CSS + JS interactive toys (calculators, timers, drawing apps)
- Procedurally generated visuals
- Web Audio API for sound effects

**Example:** A simple game with inline CSS and JS, all graphics drawn on canvas, no external dependencies.`,

  inputSchema,

  async execute(args: Params, ctx: ToolContext): Promise<ToolResult> {
    if (!ctx.user) {
      return { result: JSON.stringify({ error: 'Must be logged in to create a WebXDC app.' }) };
    }

    const appName = args.name.trim();
    const html = args.html ?? '';
    const filesMap = args.files ?? null;
    const description = (args.description ?? '').trim();

    if (!appName) {
      return { result: JSON.stringify({ error: 'An app name is required.' }) };
    }
    if (!filesMap && !html) {
      return { result: JSON.stringify({ error: 'Either "html" or "files" is required.' }) };
    }

    const buddyKey = getBuddyKey(ctx.getBuddySecretKey);
    if (!buddyKey) {
      return { result: JSON.stringify({ error: BUDDY_KEY_UNAVAILABLE_ERROR }) };
    }

    // Build the .xdc archive in memory using fflate
    const manifest = `name = "${appName.replace(/"/g, '\\"')}"\n`;
    const entries: Record<string, Uint8Array> = {
      'manifest.toml': strToU8(manifest),
    };

    if (filesMap) {
      for (const [filename, content] of Object.entries(filesMap)) {
        if (!isSafeFilename(filename)) {
          return { result: JSON.stringify({ error: `Unsafe filename rejected: "${filename}". Use simple relative paths only.` }) };
        }
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
    if (args.asset_urls) {
      const assetEntries = await Promise.all(
        Object.entries(args.asset_urls)
          .filter(([, url]) => typeof url === 'string' && url.trim())
          .map(async ([filename, url]) => {
            if (!isSafeFilename(filename)) throw new Error(`Unsafe asset filename rejected: "${filename}". Use simple relative paths only.`);
            const safeUrl = sanitizeToolFetchUrl(url);
            if (!safeUrl) throw new Error(`Invalid asset URL for "${filename}": must be a valid public HTTPS URL.`);
            const res = await globalThis.fetch(safeUrl, { signal: AbortSignal.timeout(60_000) });
            if (!res.ok) throw new Error(`Failed to fetch asset "${filename}" from ${safeUrl}: ${res.status}`);
            return [filename, new Uint8Array(await res.arrayBuffer())] as const;
          }),
      );
      for (const [filename, bytes] of assetEntries) {
        entries[filename] = bytes;
      }
    }

    const zipped = zipSync(entries);

    const slug = appName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const xdcFile = new File([zipped], `${slug}.xdc`, { type: 'application/x-webxdc' });

    // Upload to Blossom
    const uploader = createBuddyUploader(buddyKey.sk, ctx.config);

    const uploadTags = await uploader.upload(xdcFile);
    let blossomUrl = uploadTags[0][1];

    if (!blossomUrl.endsWith('.xdc')) {
      blossomUrl = blossomUrl + '.xdc';
    }

    const uuid = crypto.randomUUID();
    const eventTags: string[][] = [
      ['url', blossomUrl],
      ['m', 'application/x-webxdc'],
      ['alt', `Webxdc app: ${appName}`],
      ['webxdc', uuid],
    ];

    const hashTag = uploadTags.find(t => t[0] === 'x');
    if (hashTag) eventTags.push(['x', hashTag[1]]);

    const oxTag = uploadTags.find(t => t[0] === 'ox');
    if (oxTag) eventTags.push(['ox', oxTag[1]]);

    const sizeTag = uploadTags.find(t => t[0] === 'size');
    if (sizeTag) eventTags.push(['size', sizeTag[1]]);

    const imageUrl = sanitizeUrl((args.image_url ?? '').trim());
    if (imageUrl) eventTags.push(['image', imageUrl]);

    const webxdcEvent = await signAndPublishAsBuddy(
      ctx.nostr, buddyKey.sk,
      { kind: 1063, content: description || appName, tags: eventTags, created_at: Math.floor(Date.now() / 1000) },
    );

    return {
      result: JSON.stringify({
        success: true,
        event_id: webxdcEvent.id,
        pubkey: buddyKey.pubkey,
        name: appName,
        url: blossomUrl,
        size: xdcFile.size,
      }),
      nostrEvent: webxdcEvent,
    };
  },
};
