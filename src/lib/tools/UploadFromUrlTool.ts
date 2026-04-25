import { z } from 'zod';

import { proxyUrl } from '@/lib/proxyUrl';
import { sanitizeUrl } from '@/lib/sanitizeUrl';
import { BUDDY_KEY_UNAVAILABLE_ERROR, createBuddyUploader, getBuddyKey } from './helpers';

import type { Tool, ToolResult, ToolContext } from './Tool';

const inputSchema = z.object({
  urls: z.array(z.string()).describe('Array of file URLs to download and upload (max 50).'),
});

type Params = z.infer<typeof inputSchema>;

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

export const UploadFromUrlTool: Tool<Params> = {
  description: `Download files from URLs and upload them to Blossom file servers. Returns the resulting Blossom URLs.

Supports any file type: images (png, jpg, gif, webp, svg), WebXDC apps (.xdc), archives (.zip), video, audio, documents, etc. MIME types are detected from file extensions — .xdc files are uploaded as application/x-webxdc.

Use this after fetch_page to upload discovered files, or directly with known URLs. Each file is fetched via CORS proxy and uploaded to Blossom. The user must be logged in and the upload is signed by Buddy.

Handles up to 50 files per call. Returns an array of objects with the original URL, the Blossom URL, detected MIME type, and a suggested shortcode derived from the filename.`,

  inputSchema,

  async execute(args: Params, ctx: ToolContext): Promise<ToolResult> {
    if (!ctx.user) {
      return { result: JSON.stringify({ error: 'Must be logged in to upload files.' }) };
    }

    const urls = args.urls.slice(0, 50);
    if (urls.length === 0) {
      return { result: JSON.stringify({ error: 'At least one URL is required.' }) };
    }

    const buddyKey = getBuddyKey(ctx.getBuddySecretKey);
    if (!buddyKey) {
      return { result: JSON.stringify({ error: BUDDY_KEY_UNAVAILABLE_ERROR }) };
    }

    const uploader = createBuddyUploader(buddyKey.sk, ctx.config);

    const results: Array<{ original_url: string; blossom_url?: string; shortcode: string; mime_type?: string; error?: string }> = [];

    for (const fileUrl of urls) {
      const safeUrl = sanitizeUrl(fileUrl);
      if (!safeUrl) {
        results.push({ original_url: fileUrl, shortcode: '', error: 'Invalid or non-HTTPS URL' });
        continue;
      }

      try {
        const proxied = proxyUrl({ template: ctx.config.corsProxy, url: safeUrl });
        const response = await fetch(proxied, { signal: AbortSignal.timeout(30_000) });

        if (!response.ok) {
          results.push({ original_url: fileUrl, shortcode: '', error: `HTTP ${response.status}` });
          continue;
        }

        const blob = await response.blob();

        const pathname = new URL(safeUrl).pathname;
        const filename = pathname.split('/').pop() || 'file';
        const dotIndex = filename.lastIndexOf('.');
        const baseName = dotIndex > 0 ? filename.slice(0, dotIndex) : filename;
        const ext = dotIndex > 0 ? filename.slice(dotIndex + 1).toLowerCase() : '';
        const shortcode = baseName
          .replace(/[^a-zA-Z0-9_-]/g, '_')
          .replace(/_+/g, '_')
          .replace(/^_|_$/g, '')
          .toLowerCase();

        const mimeType = blob.type && blob.type !== 'application/octet-stream'
          ? blob.type
          : MIME_BY_EXT[ext] ?? 'application/octet-stream';

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
  },
};
