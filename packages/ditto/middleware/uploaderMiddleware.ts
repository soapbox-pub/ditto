import { DenoUploader, IPFSUploader, S3Uploader } from '@ditto/uploaders';
import { BlossomUploader, NostrBuildUploader } from '@nostrify/nostrify/uploaders';
import { safeFetch } from '@soapbox/safe-fetch';

import { AppMiddleware } from '@/app.ts';

/** Set an uploader for the user. */
export const uploaderMiddleware: AppMiddleware = async (c, next) => {
  const { user, conf } = c.var;
  const signer = user?.signer;

  switch (conf.uploader) {
    case 's3':
      c.set(
        'uploader',
        new S3Uploader({
          accessKey: conf.s3.accessKey,
          bucket: conf.s3.bucket,
          endPoint: conf.s3.endPoint!,
          pathStyle: conf.s3.pathStyle,
          port: conf.s3.port,
          region: conf.s3.region!,
          secretKey: conf.s3.secretKey,
          sessionToken: conf.s3.sessionToken,
          useSSL: conf.s3.useSSL,
          baseUrl: conf.mediaDomain,
        }),
      );
      break;
    case 'ipfs':
      c.set('uploader', new IPFSUploader({ baseUrl: conf.mediaDomain, apiUrl: conf.ipfs.apiUrl, fetch: safeFetch }));
      break;
    case 'local':
      c.set('uploader', new DenoUploader({ baseUrl: conf.mediaDomain, dir: conf.uploadsDir }));
      break;
    case 'nostrbuild':
      c.set('uploader', new NostrBuildUploader({ endpoint: conf.nostrbuildEndpoint, signer, fetch: safeFetch }));
      break;
    case 'blossom':
      if (signer) {
        c.set('uploader', new BlossomUploader({ servers: conf.blossomServers, signer, fetch: safeFetch }));
      }
      break;
  }

  await next();
};
