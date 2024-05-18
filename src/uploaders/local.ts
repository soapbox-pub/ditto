import { join } from 'node:path';

import { crypto } from '@std/crypto';
import { encodeHex } from '@std/encoding/hex';
import { extensionsByType } from '@std/media-types';

import { Conf } from '@/config.ts';

import type { Uploader } from './types.ts';

/** Local filesystem uploader. */
const localUploader: Uploader = {
  async upload(file) {
    const sha256 = encodeHex(await crypto.subtle.digest('SHA-256', file.stream()));
    const ext = extensionsByType(file.type)?.[0] ?? 'bin';
    const filename = `${sha256}.${ext}`;

    await Deno.mkdir(Conf.uploadsDir, { recursive: true });
    await Deno.writeFile(join(Conf.uploadsDir, filename), file.stream());

    const { mediaDomain } = Conf;
    const url = new URL(mediaDomain);
    const path = url.pathname === '/' ? filename : join(url.pathname, filename);

    return [
      ['url', new URL(path, url).toString()],
      ['m', file.type],
      ['x', sha256],
      ['size', file.size.toString()],
    ];
  },
  async delete(id) {
    await Deno.remove(join(Conf.uploadsDir, id));
  },
};

export { localUploader };
