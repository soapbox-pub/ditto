import { dotenv, getPublicKey, nip19, secp, z } from '@/deps.ts';
import { ipfsUploader } from '@/uploaders/ipfs.ts';
import { s3Uploader } from '@/uploaders/s3.ts';

import type { Uploader } from '@/uploaders/types.ts';

/** Load environment config from `.env` */
await dotenv.load({
  export: true,
  defaultsPath: null,
  examplePath: null,
});

/** Application-wide configuration. */
const Conf = {
  /** Ditto admin secret key in nip19 format. This is the way it's configured by an admin. */
  get nsec() {
    const value = Deno.env.get('DITTO_NSEC');
    if (!value) {
      throw new Error('Missing DITTO_NSEC');
    }
    if (!value.startsWith('nsec1')) {
      throw new Error('Invalid DITTO_NSEC');
    }
    return value as `nsec1${string}`;
  },
  /** Ditto admin secret key in hex format. */
  get seckey() {
    return nip19.decode(Conf.nsec).data;
  },
  /** Ditto admin public key in hex format. */
  get pubkey() {
    return getPublicKey(Conf.seckey);
  },
  /** Ditto admin secret key as a Web Crypto key. */
  get cryptoKey() {
    return crypto.subtle.importKey(
      'raw',
      secp.etc.hexToBytes(Conf.seckey),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign', 'verify'],
    );
  },
  get relay(): `wss://${string}` | `ws://${string}` {
    const { protocol, host } = Conf.url;
    return `${protocol === 'https:' ? 'wss:' : 'ws:'}//${host}/relay`;
  },
  /** Origin of the Ditto server, including the protocol and port. */
  get localDomain() {
    return Deno.env.get('LOCAL_DOMAIN') || 'http://localhost:8000';
  },
  /** Path to the main SQLite database which stores users, events, and more. */
  get dbPath() {
    return Deno.env.get('DB_PATH') || 'data/db.sqlite3';
  },
  /** Character limit to enforce for posts made through Mastodon API. */
  get postCharLimit() {
    return Number(Deno.env.get('POST_CHAR_LIMIT') || 5000);
  },
  /** Admin contact to expose through various endpoints. This information is public. */
  get adminEmail() {
    return Deno.env.get('ADMIN_EMAIL') || 'webmaster@localhost';
  },
  /** S3 media storage configuration. */
  s3: {
    get endPoint() {
      return Deno.env.get('S3_ENDPOINT')!;
    },
    get region() {
      return Deno.env.get('S3_REGION')!;
    },
    get accessKey() {
      return Deno.env.get('S3_ACCESS_KEY');
    },
    get secretKey() {
      return Deno.env.get('S3_SECRET_KEY');
    },
    get bucket() {
      return Deno.env.get('S3_BUCKET');
    },
    get pathStyle() {
      return optionalBooleanSchema.parse(Deno.env.get('S3_PATH_STYLE'));
    },
    get port() {
      return optionalNumberSchema.parse(Deno.env.get('S3_PORT'));
    },
    get sessionToken() {
      return Deno.env.get('S3_SESSION_TOKEN');
    },
    get useSSL() {
      return optionalBooleanSchema.parse(Deno.env.get('S3_USE_SSL'));
    },
  },
  /** IPFS uploader configuration. */
  ipfs: {
    /** Base URL for private IPFS API calls. */
    get apiUrl() {
      return Deno.env.get('IPFS_API_URL') || 'http://localhost:5001';
    },
  },
  /** Module to upload files with. */
  get uploader(): Uploader {
    switch (Deno.env.get('DITTO_UPLOADER')) {
      case 's3':
        return s3Uploader;
      case 'ipfs':
        return ipfsUploader;
      default:
        return ipfsUploader;
    }
  },
  /** Media base URL for uploads. */
  get mediaDomain() {
    const value = Deno.env.get('MEDIA_DOMAIN');

    if (!value) {
      const url = Conf.url;
      url.host = `media.${url.host}`;
      return url.toString();
    }

    return value;
  },
  /** Domain of the Ditto server as a `URL` object, for easily grabbing the `hostname`, etc. */
  get url() {
    return new URL(Conf.localDomain);
  },
  /** Merges the path with the localDomain. */
  local(path: string): string {
    return mergePaths(Conf.localDomain, path);
  },
};

const optionalBooleanSchema = z
  .enum(['true', 'false'])
  .optional()
  .transform((value) => value !== undefined ? value === 'true' : undefined);

const optionalNumberSchema = z
  .string()
  .optional()
  .transform((value) => value !== undefined ? Number(value) : undefined);

function mergePaths(base: string, path: string) {
  const url = new URL(
    path.startsWith('/') ? path : new URL(path).pathname,
    base,
  );

  if (!path.startsWith('/')) {
    // Copy query parameters from the original URL to the new URL
    const originalUrl = new URL(path);
    url.search = originalUrl.search;
  }

  return url.toString();
}

export { Conf };
