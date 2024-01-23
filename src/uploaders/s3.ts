import { Conf } from '@/config.ts';
import { IpfsHash, S3Client } from '@/deps.ts';

import type { Uploader } from './types.ts';

/**
 * S3-compatible uploader for AWS, Wasabi, DigitalOcean Spaces, and more.
 * Files are named by their IPFS CID and exposed at `/ipfs/<cid>`, letting it
 * take advantage of IPFS features while not really using IPFS.
 */
const s3Uploader: Uploader = {
  async upload(file, _signal) {
    const cid = await IpfsHash.of(file.stream()) as string;

    // FIXME: Can't cancel S3 requests: https://github.com/bradenmacdonald/deno-s3-lite-client/issues/24
    await client().putObject(`ipfs/${cid}`, file.stream(), {
      metadata: {
        'Content-Type': file.type,
        'x-amz-acl': 'public-read',
      },
    });

    return {
      cid,
    };
  },
  async delete(cid, _signal) {
    // FIXME: Can't cancel S3 requests: https://github.com/bradenmacdonald/deno-s3-lite-client/issues/24
    await client().deleteObject(`ipfs/${cid}`);
  },
};

/** Build S3 client from config. */
function client() {
  return new S3Client({ ...Conf.s3 });
}

export { s3Uploader };
