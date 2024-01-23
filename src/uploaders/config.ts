import { Conf } from '@/config.ts';

import { ipfsUploader } from './ipfs.ts';
import { s3Uploader } from './s3.ts';

import type { Uploader } from './types.ts';

/** Meta-uploader determined from configuration. */
const configUploader: Uploader = {
  upload(file, signal) {
    return uploader().upload(file, signal);
  },
  delete(cid, signal) {
    return uploader().delete(cid, signal);
  },
};

/** Get the uploader module based on configuration. */
function uploader() {
  switch (Conf.uploader) {
    case 's3':
      return s3Uploader;
    case 'ipfs':
      return ipfsUploader;
    default:
      return ipfsUploader;
  }
}

export { configUploader };
