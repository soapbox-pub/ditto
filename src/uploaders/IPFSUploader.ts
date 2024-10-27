import { NUploader } from '@nostrify/nostrify';
import { z } from 'zod';
import { probe } from '@jcayzac/image-information';
import { Stickynotes } from '@soapbox/stickynotes';
import { encode } from 'blurhash';
import { encodeHex } from '@std/encoding/hex';

const console = new Stickynotes('ditto:ipfs:uploader');

export interface IPFSUploaderOpts {
  baseUrl: string;
  apiUrl?: string;
  fetch?: typeof fetch;
}

function toByteArray(f: File): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('loadend', (m) => {
      if (m?.target?.result instanceof ArrayBuffer) {
        resolve(new Uint8Array(m.target.result));
      } else reject('Error loading file: readAsArrayBufferFailed');
    });
    reader.addEventListener('error', (e) => reject(e));
    reader.readAsArrayBuffer(f);
  });
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
    const tags: [['url', string], ...string[][]] = [
      ['url', new URL(`/ipfs/${cid}`, this.baseUrl).toString()],
      ['m', file.type],
      ['cid', cid],
      ['size', file.size.toString()],
    ];

    try {
      const buffer = await toByteArray(file);
      const hash = await crypto.subtle.digest('SHA-256', buffer).then(encodeHex);
      tags.push(['x', hash], ['ox', hash]);
      const metadata = probe(buffer);
      if (metadata) {
        // sane default from https://github.com/woltapp/blurhash readme
        const blurhash = encode(new Uint8ClampedArray(buffer), metadata.width, metadata.height, 4, 4);
        tags.push(['blurhash', blurhash]);
        tags.push(['dim', `${metadata.width}x${metadata.height}`]);
      }
    } catch (e) {
      console.error(`Error parsing ipfs metadata: ${e}`);
    }

    return tags;
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
