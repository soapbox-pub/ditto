import { dotenv, getPublicKey, nip19, z } from '@/deps.ts';

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
      Conf.seckey,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign', 'verify'],
    );
  },
  get relay(): `wss://${string}` | `ws://${string}` {
    const { protocol, host } = Conf.url;
    return `${protocol === 'https:' ? 'wss:' : 'ws:'}//${host}/relay`;
  },
  /** Relay to use for NIP-50 `search` queries. */
  get searchRelay() {
    return Deno.env.get('SEARCH_RELAY');
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
  get uploader() {
    return Deno.env.get('DITTO_UPLOADER');
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
  /** Max upload size for files in number of bytes. Default 100MiB. */
  get maxUploadSize() {
    return Number(Deno.env.get('MAX_UPLOAD_SIZE') || 100 * 1024 * 1024);
  },
  /** Usernames that regular users cannot sign up with. */
  get forbiddenUsernames() {
    return Deno.env.get('FORBIDDEN_USERNAMES')?.split(',') || [
      '_',
      'admin',
      'administrator',
      'root',
      'sysadmin',
      'system',
    ];
  },
  /** Whether registrations are open or closed. */
  get registrations() {
    return optionalBooleanSchema.parse(Deno.env.get('DITTO_REGISTRATIONS')) ?? false;
  },
  /** Proof-of-work configuration. */
  pow: {
    get registrations() {
      return Number(Deno.env.get('DITTO_POW_REGISTRATIONS') ?? 20);
    },
  },
  /** Domain of the Ditto server as a `URL` object, for easily grabbing the `hostname`, etc. */
  get url() {
    return new URL(Conf.localDomain);
  },
  /** Merges the path with the localDomain. */
  local(path: string): string {
    return mergePaths(Conf.localDomain, path);
  },
  /** URL to send Sentry errors to. */
  get sentryDsn() {
    return Deno.env.get('SENTRY_DSN');
  },
  /** SQLite settings. */
  sqlite: {
    /**
     * Number of bytes to use for memory-mapped IO.
     * https://www.sqlite.org/pragma.html#pragma_mmap_size
     */
    get mmapSize(): number {
      const value = Deno.env.get('SQLITE_MMAP_SIZE');
      if (value) {
        return Number(value);
      } else {
        return 1024 * 1024 * 1024;
      }
    },
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
