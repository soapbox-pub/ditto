import { BlossomUploader, NostrBuildUploader } from '@nostrify/nostrify/uploaders';
import { safeFetch } from '@soapbox/safe-fetch';

import { AppMiddleware } from '@/app.ts';
import { Conf } from '@/config.ts';
import { DenoUploader } from '@/uploaders/DenoUploader.ts';
import { IPFSUploader } from '@/uploaders/IPFSUploader.ts';
import { S3Uploader } from '@/uploaders/S3Uploader.ts';

/** Set an uploader for the user. */
export const uploaderMiddleware: AppMiddleware = async (c, next) => {
  const signer = c.get('signer');

  switch (Conf.uploader) {
    case 's3':
      c.set(
        'uploader',
        new S3Uploader({
          accessKey: Conf.s3.accessKey,
          bucket: Conf.s3.bucket,
          endPoint: Conf.s3.endPoint!,
          pathStyle: Conf.s3.pathStyle,
          port: Conf.s3.port,
          region: Conf.s3.region!,
          secretKey: Conf.s3.secretKey,
          sessionToken: Conf.s3.sessionToken,
          useSSL: Conf.s3.useSSL,
        }),
      );
      break;
    case 'ipfs':
      c.set('uploader', new IPFSUploader({ baseUrl: Conf.mediaDomain, apiUrl: Conf.ipfs.apiUrl, fetch: safeFetch }));
      break;
    case 'local':
      c.set('uploader', new DenoUploader({ baseUrl: Conf.mediaDomain, dir: Conf.uploadsDir }));
      break;
    case 'nostrbuild':
      c.set('uploader', new NostrBuildUploader({ endpoint: Conf.nostrbuildEndpoint, signer, fetch: safeFetch }));
      break;
    case 'blossom':
      if (signer) {
        c.set('uploader', new BlossomUploader({ servers: Conf.blossomServers, signer, fetch: safeFetch }));
      }
      break;
  }

  await next();
};
