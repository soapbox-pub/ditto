import { Conf } from '@/config.ts';

import { ipfsUploader } from '@/uploaders/ipfs.ts';
import { localUploader } from '@/uploaders/local.ts';
import { nostrbuildUploader } from '@/uploaders/nostrbuild.ts';
import { s3Uploader } from '@/uploaders/s3.ts';

import type { Uploader } from './types.ts';

/** Meta-uploader determined from configuration. */
const configUploader: Uploader = {
  upload(file, opts) {
    return uploader().upload(file, opts);
  },
  async delete(id, opts) {
    return await uploader().delete?.(id, opts);
  },
};

/** Get the uploader module based on configuration. */
function uploader() {
  switch (Conf.uploader) {
    case 's3':
      return s3Uploader;
    case 'ipfs':
      return ipfsUploader;
    case 'local':
      return localUploader;
    case 'nostrbuild':
      return nostrbuildUploader;
    default:
      throw new Error('No `DITTO_UPLOADER` configured. Uploads are disabled.');
  }
}

export { configUploader };
