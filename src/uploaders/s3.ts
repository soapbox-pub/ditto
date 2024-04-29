import { Conf } from '@/config.ts';
import { IpfsHash, S3Client } from '@/deps.ts';

import type { Uploader } from './types.ts';

/**
 * S3-compatible uploader for AWS, Wasabi, DigitalOcean Spaces, and more.
 * Files are named by their IPFS CID and exposed at `/ipfs/<cid>`, letting it
 * take advantage of IPFS features while not really using IPFS.
 */
const s3Uploader: Uploader = {
  async upload(file) {
    const cid = await IpfsHash.of(file.stream()) as string;

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
  async delete(cid) {
    await client().deleteObject(`ipfs/${cid}`);
  },
};

/** Build S3 client from config. */
function client() {
  return new S3Client({ ...Conf.s3 });
}

export { s3Uploader };
