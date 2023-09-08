import { Conf } from '@/config.ts';
import { IpfsHash, S3Client } from '@/deps.ts';

import type { Uploader } from './types.ts';

const s3 = new S3Client({ ...Conf.s3 });

/**
 * S3-compatible uploader for AWS, Wasabi, DigitalOcean Spaces, and more.
 * Files are named by their IPFS CID and exposed at `/ipfs/<cid>`, letting it
 * take advantage of IPFS features while not really using IPFS.
 */
const s3Uploader: Uploader = {
  async upload(file) {
    const cid = await IpfsHash.of(file.stream()) as string;

    await s3.putObject(`ipfs/${cid}`, file.stream(), {
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
    await s3.deleteObject(`ipfs/${cid}`);
  },
};

export { s3Uploader };
