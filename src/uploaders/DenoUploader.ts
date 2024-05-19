import { join } from 'node:path';

import { crypto } from '@std/crypto';
import { encodeHex } from '@std/encoding/hex';
import { extensionsByType } from '@std/media-types';

import { DittoUploader } from '@/interfaces/DittoUploader.ts';

export interface DenoUploaderOpts {
  baseUrl: string;
  dir: string;
}

/** Local Deno filesystem uploader. */
export class DenoUploader implements DittoUploader {
  constructor(private opts: DenoUploaderOpts) {}

  async upload(file: File): Promise<[['url', string], ...string[][]]> {
    const { dir, baseUrl } = this.opts;

    const sha256 = encodeHex(await crypto.subtle.digest('SHA-256', file.stream()));
    const ext = extensionsByType(file.type)?.[0] ?? 'bin';
    const filename = `${sha256}.${ext}`;

    await Deno.mkdir(dir, { recursive: true });
    await Deno.writeFile(join(dir, filename), file.stream());

    const url = new URL(baseUrl);
    const path = url.pathname === '/' ? filename : join(url.pathname, filename);

    return [
      ['url', new URL(path, url).toString()],
      ['m', file.type],
      ['x', sha256],
      ['size', file.size.toString()],
    ];
  }

  async delete(filename: string) {
    const { dir } = this.opts;
    const path = join(dir, filename);
    await Deno.remove(path);
  }
}
