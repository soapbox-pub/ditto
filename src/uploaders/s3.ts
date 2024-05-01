import { join } from 'node:path';

import { S3Client } from '@bradenmacdonald/s3-lite-client';
import { crypto } from '@std/crypto';
import { encodeHex } from '@std/encoding/hex';
import { extensionsByType } from '@std/media-types';

import { Conf } from '@/config.ts';

import type { Uploader } from './types.ts';

/** S3-compatible uploader for AWS, Wasabi, DigitalOcean Spaces, and more. */
const s3Uploader: Uploader = {
  async upload(file) {
    const sha256 = encodeHex(await crypto.subtle.digest('SHA-256', file.stream()));
    const ext = extensionsByType(file.type)?.[0] ?? 'bin';
    const filename = `${sha256}.${ext}`;

    await client().putObject(filename, file.stream(), {
      metadata: {
        'Content-Type': file.type,
        'x-amz-acl': 'public-read',
      },
    });

    const { pathStyle, bucket } = Conf.s3;
    const path = (pathStyle && bucket) ? join(bucket, filename) : filename;

    return {
      id: filename,
      sha256,
      url: new URL(path, Conf.mediaDomain).toString(),
    };
  },
  async delete(id) {
    await client().deleteObject(id);
  },
};

/** Build S3 client from config. */
function client() {
  return new S3Client({ ...Conf.s3 });
}

export { s3Uploader };
