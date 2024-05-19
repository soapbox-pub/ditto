import { z } from 'zod';

import { DittoUploader } from '@/interfaces/DittoUploader.ts';

export interface NostrBuildUploaderOpts {
  endpoint?: string;
  fetch?: typeof fetch;
}

/** Upload files to nostr.build or another compatible server. */
export class NostrBuildUploader implements DittoUploader {
  private endpoint: string;
  private fetch: typeof fetch;

  constructor(opts: NostrBuildUploaderOpts) {
    this.endpoint = opts.endpoint ?? 'https://nostr.build/api/v2/upload/files';
    this.fetch = opts.fetch ?? globalThis.fetch;
  }

  async upload(file: File, opts?: { signal?: AbortSignal }): Promise<[['url', string], ...string[][]]> {
    const formData = new FormData();
    formData.append('fileToUpload', file);

    const response = await this.fetch(this.endpoint, {
      method: 'POST',
      body: formData,
      signal: opts?.signal,
    });

    const json = await response.json();
    const [data] = NostrBuildUploader.schema().parse(json).data;

    const tags: [['url', string], ...string[][]] = [
      ['url', data.url],
      ['m', data.mime],
      ['x', data.sha256],
      ['ox', data.original_sha256],
      ['size', data.size.toString()],
    ];

    if (data.dimensions) {
      tags.push(['dim', `${data.dimensions.width}x${data.dimensions.height}`]);
    }

    if (data.blurhash) {
      tags.push(['blurhash', data.blurhash]);
    }

    return tags;
  }

  /** nostr.build API response schema. */
  private static schema() {
    return z.object({
      data: z.object({
        url: z.string().url(),
        blurhash: z.string().optional().catch(undefined),
        sha256: z.string(),
        original_sha256: z.string(),
        mime: z.string(),
        size: z.number(),
        dimensions: z.object({
          width: z.number(),
          height: z.number(),
        }).optional().catch(undefined),
      }).array().min(1),
    });
  }
}
