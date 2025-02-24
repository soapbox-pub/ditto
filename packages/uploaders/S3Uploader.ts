import { join } from 'node:path';

import { S3Client } from '@bradenmacdonald/s3-lite-client';
import { crypto } from '@std/crypto';
import { encodeHex } from '@std/encoding/hex';
import { extensionsByType } from '@std/media-types';

import type { NUploader } from '@nostrify/nostrify';

export interface S3UploaderOpts {
  endPoint: string;
  region: string;
  accessKey?: string;
  secretKey?: string;
  bucket?: string;
  pathStyle?: boolean;
  port?: number;
  sessionToken?: string;
  useSSL?: boolean;
  baseUrl?: string;
}

/** S3-compatible uploader for AWS, Wasabi, DigitalOcean Spaces, and more. */
export class S3Uploader implements NUploader {
  private client: S3Client;

  constructor(private opts: S3UploaderOpts) {
    this.client = new S3Client(opts);
  }

  async upload(file: File): Promise<[['url', string], ...string[][]]> {
    const sha256 = encodeHex(await crypto.subtle.digest('SHA-256', file.stream()));
    const ext = extensionsByType(file.type)?.[0] ?? 'bin';
    const filename = `${sha256}.${ext}`;

    await this.client.putObject(filename, file.stream(), {
      metadata: {
        'Content-Type': file.type,
        'x-amz-acl': 'public-read',
      },
    });

    const { pathStyle, bucket, baseUrl } = this.opts;

    const path = (pathStyle && bucket) ? join(bucket, filename) : filename;
    const url = new URL(path, baseUrl).toString();

    return [
      ['url', url],
      ['m', file.type],
      ['x', sha256],
      ['size', file.size.toString()],
    ];
  }

  async delete(objectName: string) {
    await this.client.deleteObject(objectName);
  }
}
