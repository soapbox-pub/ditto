import { join } from 'node:path';

import { crypto } from '@std/crypto';
import { encodeHex } from '@std/encoding/hex';
import { extensionsByType } from '@std/media-types';

import type { NUploader } from '@nostrify/nostrify';

export interface DenoUploaderOpts {
  baseUrl: string;
  dir: string;
}

/** Local Deno filesystem uploader. */
export class DenoUploader implements NUploader {
  baseUrl: string;
  dir: string;

  constructor(opts: DenoUploaderOpts) {
    this.baseUrl = opts.baseUrl;
    this.dir = opts.dir;
  }

  async upload(file: File): Promise<[['url', string], ...string[][]]> {
    const sha256 = encodeHex(await crypto.subtle.digest('SHA-256', file.stream()));
    const ext = extensionsByType(file.type)?.[0] ?? 'bin';
    const filename = `${sha256}.${ext}`;

    await Deno.mkdir(this.dir, { recursive: true });
    await Deno.writeFile(join(this.dir, filename), file.stream());

    const url = new URL(this.baseUrl);
    const path = url.pathname === '/' ? filename : join(url.pathname, filename);

    return [
      ['url', new URL(path, url).toString()],
      ['m', file.type],
      ['x', sha256],
      ['size', file.size.toString()],
    ];
  }

  async delete(filename: string) {
    const path = join(this.dir, filename);
    await Deno.remove(path);
  }
}
