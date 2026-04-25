import { z } from 'zod';

import { proxyUrl } from '@/lib/proxyUrl';

import { sanitizeToolFetchUrl } from './sanitizeToolFetchUrl';
import type { Tool, ToolResult, ToolContext } from './Tool';

const inputSchema = z.object({
  url: z.string().describe('The URL to fetch (e.g. "https://www.jamfoo.com/aim-emoticons/").'),
});

type Params = z.infer<typeof inputSchema>;

export const FetchPageTool: Tool<Params> = {
  description: `Fetch a web page and extract its content. Returns the page text and a list of image URLs found on the page. Use this when the user provides a URL and wants to download content from it — for example, to find emoji images on a page.

The page is fetched through a CORS proxy so it works in the browser. Images are extracted from <img> tags in the HTML. Relative URLs are resolved to absolute URLs.`,

  inputSchema,

  async execute(args: Params, ctx: ToolContext): Promise<ToolResult> {
    const url = sanitizeToolFetchUrl(args.url.trim());
    if (!url) {
      return { result: JSON.stringify({ error: 'A valid public HTTPS URL is required.' }) };
    }

    let html: string;
    try {
      const proxied = proxyUrl({ template: ctx.config.corsProxy, url });
      const response = await fetch(proxied, { signal: AbortSignal.timeout(30_000) });

      if (!response.ok) {
        return { result: JSON.stringify({ error: `Fetch failed: ${response.status} ${response.statusText}` }) };
      }

      html = await response.text();
    } catch (err) {
      return { result: JSON.stringify({ error: `Failed to fetch "${url}": ${err instanceof Error ? err.message : 'Unknown error'}` }) };
    }

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const imgs = Array.from(doc.querySelectorAll('img'));
    const baseUrl = new URL(url);

    const imageUrls: string[] = [];
    for (const img of imgs) {
      const src = img.getAttribute('src');
      if (!src) continue;
      try {
        const absolute = new URL(src, baseUrl).href;
        if (!/\.(png|jpe?g|gif|webp|svg|bmp|ico|avif)(\?.*)?$/i.test(absolute)) continue;
        // Filter extracted URLs through the same fetch-safe check so that
        // malicious pages cannot inject private-network URLs into the result
        // list (which typically flows into upload_from_url).
        if (sanitizeToolFetchUrl(absolute)) {
          imageUrls.push(absolute);
        }
      } catch {
        // Skip malformed URLs.
      }
    }

    const uniqueImages = [...new Set(imageUrls)];
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
  },
};
