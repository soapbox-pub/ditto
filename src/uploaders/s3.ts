import { Conf } from '@/config.ts';
import { IpfsHash, S3Client } from '@/deps.ts';

import type { Uploader } from './types.ts';

const s3 = new S3Client({ ...Conf.s3 });

const s3Uploader: Uploader = async (file) => {
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
};

export { s3Uploader };
