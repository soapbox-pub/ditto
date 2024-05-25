import url from 'node:url';

import * as dotenv from '@std/dotenv';
import { getPublicKey, nip19 } from 'nostr-tools';
import { z } from 'zod';

/** Load environment config from `.env` */
await dotenv.load({
  export: true,
  defaultsPath: null,
  examplePath: null,
});

/** Application-wide configuration. */
class Conf {
  /** Ditto admin secret key in nip19 format. This is the way it's configured by an admin. */
  static get nsec() {
    const value = Deno.env.get('DITTO_NSEC');
    if (!value) {
      throw new Error('Missing DITTO_NSEC');
    }
    if (!value.startsWith('nsec1')) {
      throw new Error('Invalid DITTO_NSEC');
    }
    return value as `nsec1${string}`;
  }
  /** Ditto admin secret key in hex format. */
  static get seckey() {
    return nip19.decode(Conf.nsec).data;
  }
  /** Ditto admin public key in hex format. */
  static pubkey = getPublicKey(Conf.seckey);
  /** Ditto admin secret key as a Web Crypto key. */
  static get cryptoKey() {
    return crypto.subtle.importKey(
      'raw',
      Conf.seckey,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign', 'verify'],
    );
  }

  static get port() {
    return parseInt(Deno.env.get('PORT') || '4036');
  }

  static get relay(): `wss://${string}` | `ws://${string}` {
    const { protocol, host } = Conf.url;
    return `${protocol === 'https:' ? 'wss:' : 'ws:'}//${host}/relay`;
  }
  /** Relay to use for NIP-50 `search` queries. */
  static get searchRelay() {
    return Deno.env.get('SEARCH_RELAY');
  }
  /** Origin of the Ditto server, including the protocol and port. */
  static get localDomain() {
    return Deno.env.get('LOCAL_DOMAIN') || `http://localhost:${Conf.port}`;
  }
  /** URL to an external Nostr viewer. */
  static get externalDomain() {
    return Deno.env.get('NOSTR_EXTERNAL') || Conf.localDomain;
  }
  /**
   * Heroku-style database URL. This is used in production to connect to the
   * database.
   *
   * Follows the format:
   *
   * ```txt
   * protocol://username:password@host:port/database_name
   * ```
   */
  static get databaseUrl(): string {
    return Deno.env.get('DATABASE_URL') ?? 'sqlite://data/db.sqlite3';
  }
  static db = {
    get url(): url.UrlWithStringQuery {
      return url.parse(Deno.env.get('DATABASE_URL') ?? 'sqlite://data/db.sqlite3');
    },
    get dialect(): 'sqlite' | 'postgres' | undefined {
      switch (Conf.db.url.protocol) {
        case 'sqlite:':
          return 'sqlite';
        case 'postgres:':
        case 'postgresql:':
          return 'postgres';
      }
      return undefined;
    },
  };
  /** Character limit to enforce for posts made through Mastodon API. */
  static get postCharLimit() {
    return Number(Deno.env.get('POST_CHAR_LIMIT') || 5000);
  }
  /** S3 media storage configuration. */
  static s3 = {
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
  };
  /** IPFS uploader configuration. */
  static ipfs = {
    /** Base URL for private IPFS API calls. */
    get apiUrl() {
      return Deno.env.get('IPFS_API_URL') || 'http://localhost:5001';
    },
  };
  /** nostr.build API endpoint when the `nostrbuild` uploader is used. */
  static get nostrbuildEndpoint(): string {
    return Deno.env.get('NOSTRBUILD_ENDPOINT') || 'https://nostr.build/api/v2/upload/files';
  }
  /** Default Blossom servers to use when the `blossom` uploader is set. */
  static get blossomServers(): string[] {
    return Deno.env.get('BLOSSOM_SERVERS')?.split(',') || ['https://blossom.primal.net/'];
  }
  /** Module to upload files with. */
  static get uploader() {
    return Deno.env.get('DITTO_UPLOADER');
  }
  /** Location to use for local uploads. */
  static get uploadsDir() {
    return Deno.env.get('UPLOADS_DIR') || 'data/uploads';
  }
  /** Media base URL for uploads. */
  static get mediaDomain() {
    const value = Deno.env.get('MEDIA_DOMAIN');

    if (!value) {
      const url = Conf.url;
      url.host = `media.${url.host}`;
      return url.toString();
    }

    return value;
  }
  /** Max upload size for files in number of bytes. Default 100MiB. */
  static get maxUploadSize() {
    return Number(Deno.env.get('MAX_UPLOAD_SIZE') || 100 * 1024 * 1024);
  }
  /** Usernames that regular users cannot sign up with. */
  static get forbiddenUsernames() {
    return Deno.env.get('FORBIDDEN_USERNAMES')?.split(',') || [
      '_',
      'admin',
      'administrator',
      'root',
      'sysadmin',
      'system',
    ];
  }
  /** Proof-of-work configuration. */
  static pow = {
    get registrations() {
      return Number(Deno.env.get('DITTO_POW_REGISTRATIONS') ?? 20);
    },
  };
  /** Domain of the Ditto server as a `URL` object, for easily grabbing the `hostname`, etc. */
  static get url() {
    return new URL(Conf.localDomain);
  }
  /** Merges the path with the localDomain. */
  static local(path: string): string {
    return mergePaths(Conf.localDomain, path);
  }
  /** Get an external URL for the NIP-19 identifier. */
  static external(nip19: string): string {
    return new URL(`/${nip19}`, Conf.externalDomain).toString();
  }
  /** URL to send Sentry errors to. */
  static get sentryDsn() {
    return Deno.env.get('SENTRY_DSN');
  }
  /** SQLite settings. */
  static sqlite = {
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
  };
  /** Postgres settings. */
  static pg = {
    /** Number of connections to use in the pool. */
    get poolSize(): number {
      return Number(Deno.env.get('PG_POOL_SIZE') ?? 10);
    },
  };
  /** Whether to enable requesting events from known relays. */
  static get firehoseEnabled(): boolean {
    return optionalBooleanSchema.parse(Deno.env.get('FIREHOSE_ENABLED')) ?? true;
  }
  /** Path to the custom policy module. Must be an absolute path, https:, npm:, or jsr: URI. */
  static get policy(): string {
    return Deno.env.get('DITTO_POLICY') || new URL('../data/policy.ts', import.meta.url).pathname;
  }
}

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
