import { z } from 'zod';

import type { NUploader } from '@nostrify/nostrify';

export interface IPFSUploaderOpts {
  baseUrl: string;
  apiUrl?: string;
  fetch?: typeof fetch;
}

/**
 * IPFS uploader. It expects an IPFS node up and running.
 * It will try to connect to `http://localhost:5001` by default,
 * and upload the file using the REST API.
 */
export class IPFSUploader implements NUploader {
  private baseUrl: string;
  private apiUrl: string;
  private fetch: typeof fetch;

  constructor(opts: IPFSUploaderOpts) {
    this.baseUrl = opts.baseUrl;
    this.apiUrl = opts.apiUrl ?? 'http://localhost:5001';
    this.fetch = opts.fetch ?? globalThis.fetch;
  }

  async upload(file: File, opts?: { signal?: AbortSignal }): Promise<[['url', string], ...string[][]]> {
    const url = new URL('/api/v0/add', this.apiUrl);

    const formData = new FormData();
    formData.append('file', file);

    const response = await this.fetch(url, {
      method: 'POST',
      body: formData,
      signal: opts?.signal,
    });

    const { Hash: cid } = IPFSUploader.schema().parse(await response.json());

    return [
      ['url', new URL(`/ipfs/${cid}`, this.baseUrl).toString()],
      ['m', file.type],
      ['cid', cid],
      ['size', file.size.toString()],
    ];
  }

  async delete(cid: string, opts?: { signal?: AbortSignal }): Promise<void> {
    const url = new URL('/api/v0/pin/rm', this.apiUrl);

    const query = new URLSearchParams();
    query.set('arg', cid);
    url.search = query.toString();

    await this.fetch(url, {
      method: 'POST',
      signal: opts?.signal,
    });
  }

  /** Response schema for POST `/api/v0/add`. */
  private static schema() {
    return z.object({
      Name: z.string(),
      Hash: z.string(),
      Size: z.string(),
    });
  }
}
