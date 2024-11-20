import os from 'node:os';
import ISO6391, { LanguageCode } from 'iso-639-1';
import { getPublicKey, nip19 } from 'nostr-tools';
import { z } from 'zod';
import { decodeBase64 } from '@std/encoding/base64';
import { encodeBase64Url } from '@std/encoding/base64url';

import { getEcdsaPublicKey } from '@/utils/crypto.ts';

/** Application-wide configuration. */
class Conf {
  private static _pubkey: string | undefined;
  /** Ditto admin secret key in nip19 format. This is the way it's configured by an admin. */
  static get nsec(): `nsec1${string}` {
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
  static get seckey(): Uint8Array {
    return nip19.decode(Conf.nsec).data;
  }
  /** Ditto admin public key in hex format. */
  static get pubkey(): string {
    if (!this._pubkey) {
      this._pubkey = getPublicKey(Conf.seckey);
    }
    return this._pubkey;
  }
  /** Port to use when serving the HTTP server. */
  static get port(): number {
    return parseInt(Deno.env.get('PORT') || '4036');
  }
  /** Relay URL to the Ditto server's relay. */
  static get relay(): `wss://${string}` | `ws://${string}` {
    const { protocol, host } = Conf.url;
    return `${protocol === 'https:' ? 'wss:' : 'ws:'}//${host}/relay`;
  }
  /** Relay to use for NIP-50 `search` queries. */
  static get searchRelay(): string | undefined {
    return Deno.env.get('SEARCH_RELAY');
  }
  /** Origin of the Ditto server, including the protocol and port. */
  static get localDomain(): string {
    return Deno.env.get('LOCAL_DOMAIN') || `http://localhost:${Conf.port}`;
  }
  /** Link to an external nostr viewer. */
  static get externalDomain(): string {
    return Deno.env.get('NOSTR_EXTERNAL') || 'https://njump.me';
  }
  /** Get a link to a nip19-encoded entity in the configured external viewer. */
  static external(path: string) {
    return new URL(path, Conf.externalDomain).toString();
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
    return Deno.env.get('DATABASE_URL') ?? 'file://data/pgdata';
  }
  /** PGlite debug level. 0 disables logging. */
  static get pgliteDebug(): 0 | 1 | 2 | 3 | 4 | 5 {
    return Number(Deno.env.get('PGLITE_DEBUG') || 0) as 0 | 1 | 2 | 3 | 4 | 5;
  }
  private static _vapidPublicKey: Promise<string | undefined> | undefined;
  static get vapidPublicKey(): Promise<string | undefined> {
    if (!this._vapidPublicKey) {
      this._vapidPublicKey = (async () => {
        const keys = await Conf.vapidKeys;
        if (keys) {
          const { publicKey } = keys;
          const bytes = await crypto.subtle.exportKey('raw', publicKey);
          return encodeBase64Url(bytes);
        }
      })();
    }

    return this._vapidPublicKey;
  }
  static get vapidKeys(): Promise<CryptoKeyPair | undefined> {
    return (async () => {
      const encoded = Deno.env.get('VAPID_PRIVATE_KEY');

      if (!encoded) {
        return;
      }

      const keyData = decodeBase64(encoded);

      const privateKey = await crypto.subtle.importKey(
        'pkcs8',
        keyData,
        { name: 'ECDSA', namedCurve: 'P-256' },
        true,
        ['sign'],
      );
      const publicKey = await getEcdsaPublicKey(privateKey, true);

      return { privateKey, publicKey };
    })();
  }
  static db = {
    /** Database query timeout configurations. */
    timeouts: {
      /** Default query timeout when another setting isn't more specific. */
      get default(): number {
        return Number(Deno.env.get('DB_TIMEOUT_DEFAULT') || 5_000);
      },
      /** Timeout used for queries made through the Nostr relay. */
      get relay(): number {
        return Number(Deno.env.get('DB_TIMEOUT_RELAY') || 1_000);
      },
      /** Timeout used for timelines such as home, notifications, hashtag, etc. */
      get timelines(): number {
        return Number(Deno.env.get('DB_TIMEOUT_TIMELINES') || 15_000);
      },
    },
  };
  /** Time-to-live for captchas in milliseconds. */
  static get captchaTTL(): number {
    return Number(Deno.env.get('CAPTCHA_TTL') || 5 * 60 * 1000);
  }
  /** Character limit to enforce for posts made through Mastodon API. */
  static get postCharLimit(): number {
    return Number(Deno.env.get('POST_CHAR_LIMIT') || 5000);
  }
  /** S3 media storage configuration. */
  static s3 = {
    get endPoint(): string | undefined {
      return Deno.env.get('S3_ENDPOINT');
    },
    get region(): string | undefined {
      return Deno.env.get('S3_REGION');
    },
    get accessKey(): string | undefined {
      return Deno.env.get('S3_ACCESS_KEY');
    },
    get secretKey(): string | undefined {
      return Deno.env.get('S3_SECRET_KEY');
    },
    get bucket(): string | undefined {
      return Deno.env.get('S3_BUCKET');
    },
    get pathStyle(): boolean | undefined {
      return optionalBooleanSchema.parse(Deno.env.get('S3_PATH_STYLE'));
    },
    get port(): number | undefined {
      return optionalNumberSchema.parse(Deno.env.get('S3_PORT'));
    },
    get sessionToken(): string | undefined {
      return Deno.env.get('S3_SESSION_TOKEN');
    },
    get useSSL(): boolean | undefined {
      return optionalBooleanSchema.parse(Deno.env.get('S3_USE_SSL'));
    },
  };
  /** IPFS uploader configuration. */
  static ipfs = {
    /** Base URL for private IPFS API calls. */
    get apiUrl(): string {
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
  static get uploader(): string | undefined {
    return Deno.env.get('DITTO_UPLOADER');
  }
  /** Location to use for local uploads. */
  static get uploadsDir(): string {
    return Deno.env.get('UPLOADS_DIR') || 'data/uploads';
  }
  /** Media base URL for uploads. */
  static get mediaDomain(): string {
    const value = Deno.env.get('MEDIA_DOMAIN');

    if (!value) {
      const url = Conf.url;
      url.host = `media.${url.host}`;
      return url.toString();
    }

    return value;
  }
  /**
   * Whether to analyze media metadata with [blurhash](https://www.npmjs.com/package/blurhash) and [sharp](https://www.npmjs.com/package/sharp).
   * This is prone to security vulnerabilities, which is why it's not enabled by default.
   */
  static get mediaAnalyze(): boolean {
    return optionalBooleanSchema.parse(Deno.env.get('MEDIA_ANALYZE')) ?? false;
  }
  /** Max upload size for files in number of bytes. Default 100MiB. */
  static get maxUploadSize(): number {
    return Number(Deno.env.get('MAX_UPLOAD_SIZE') || 100 * 1024 * 1024);
  }
  /** Usernames that regular users cannot sign up with. */
  static get forbiddenUsernames(): string[] {
    return Deno.env.get('FORBIDDEN_USERNAMES')?.split(',') || [
      '_',
      'admin',
      'administrator',
      'root',
      'sysadmin',
      'system',
    ];
  }
  /** Domain of the Ditto server as a `URL` object, for easily grabbing the `hostname`, etc. */
  static get url(): URL {
    return new URL(Conf.localDomain);
  }
  /** Merges the path with the localDomain. */
  static local(path: string): string {
    return mergePaths(Conf.localDomain, path);
  }
  /** URL to send Sentry errors to. */
  static get sentryDsn(): string | undefined {
    return Deno.env.get('SENTRY_DSN');
  }
  /** Postgres settings. */
  static pg = {
    /** Number of connections to use in the pool. */
    get poolSize(): number {
      return Number(Deno.env.get('PG_POOL_SIZE') ?? 20);
    },
  };
  /** Whether to enable requesting events from known relays. */
  static get firehoseEnabled(): boolean {
    return optionalBooleanSchema.parse(Deno.env.get('FIREHOSE_ENABLED')) ?? true;
  }
  /** Number of events the firehose is allowed to process at one time before they have to wait in a queue. */
  static get firehoseConcurrency(): number {
    return Math.ceil(Number(Deno.env.get('FIREHOSE_CONCURRENCY') ?? (Conf.pg.poolSize * 0.25)));
  }
  /** Nostr event kinds of events to listen for on the firehose. */
  static get firehoseKinds(): number[] {
    return (Deno.env.get('FIREHOSE_KINDS') ?? '0, 1, 3, 5, 6, 7, 9735, 10002')
      .split(/[, ]+/g)
      .map(Number);
  }
  /**
   * Whether Ditto should subscribe to Nostr events from the Postgres database itself.
   * This would make Nostr events inserted directly into Postgres available to the streaming API and relay.
   */
  static get notifyEnabled(): boolean {
    return optionalBooleanSchema.parse(Deno.env.get('NOTIFY_ENABLED')) ?? false;
  }
  /** Whether to enable Ditto cron jobs. */
  static get cronEnabled(): boolean {
    return optionalBooleanSchema.parse(Deno.env.get('CRON_ENABLED')) ?? true;
  }
  /** Crawler User-Agent regex to render link previews to. */
  static get crawlerRegex(): RegExp {
    return new RegExp(
      Deno.env.get('CRAWLER_REGEX') ||
        'googlebot|bingbot|yandex|baiduspider|twitterbot|facebookexternalhit|rogerbot|linkedinbot|embedly|quora link preview|showyoubot|outbrain|pinterestbot|slackbot|vkShare|W3C_Validator|whatsapp|mastodon|pleroma|Discordbot|AhrefsBot|SEMrushBot|MJ12bot|SeekportBot|Synapse|Matrix',
      'i',
    );
  }
  /** User-Agent to use when fetching link previews. Pretend to be Facebook by default. */
  static get fetchUserAgent(): string {
    return Deno.env.get('DITTO_FETCH_USER_AGENT') ?? 'facebookexternalhit';
  }
  /** Path to the custom policy module. Must be an absolute path, https:, npm:, or jsr: URI. */
  static get policy(): string {
    return Deno.env.get('DITTO_POLICY') || new URL('../data/policy.ts', import.meta.url).pathname;
  }
  /** Absolute path to the data directory used by Ditto. */
  static get dataDir(): string {
    return Deno.env.get('DITTO_DATA_DIR') || new URL('../data', import.meta.url).pathname;
  }
  /** Absolute path of the Deno directory. */
  static get denoDir(): string {
    return Deno.env.get('DENO_DIR') || `${os.userInfo().homedir}/.cache/deno`;
  }
  /** Whether zap splits should be enabled. */
  static get zapSplitsEnabled(): boolean {
    return optionalBooleanSchema.parse(Deno.env.get('ZAP_SPLITS_ENABLED')) ?? false;
  }
  /** Languages this server wishes to highlight. Used when querying trends.*/
  static get preferredLanguages(): LanguageCode[] | undefined {
    return Deno.env.get('DITTO_LANGUAGES')?.split(',')?.filter(ISO6391.validate) as LanguageCode[];
  }
  /** Translation provider used to translate posts. */
  static get translationProvider(): string | undefined {
    return Deno.env.get('TRANSLATION_PROVIDER');
  }
  /** DeepL URL endpoint. */
  static get deeplBaseUrl(): string | undefined {
    return Deno.env.get('DEEPL_BASE_URL');
  }
  /** DeepL API KEY. */
  static get deeplApiKey(): string | undefined {
    return Deno.env.get('DEEPL_API_KEY');
  }
  /** LibreTranslate URL endpoint. */
  static get libretranslateBaseUrl(): string | undefined {
    return Deno.env.get('LIBRETRANSLATE_BASE_URL');
  }
  /** LibreTranslate API KEY. */
  static get libretranslateApiKey(): string | undefined {
    return Deno.env.get('LIBRETRANSLATE_API_KEY');
  }
  /** Cache settings. */
  static caches = {
    /** NIP-05 cache settings. */
    get nip05(): { max: number; ttl: number } {
      return {
        max: Number(Deno.env.get('DITTO_CACHE_NIP05_MAX') || 3000),
        ttl: Number(Deno.env.get('DITTO_CACHE_NIP05_TTL') || 1 * 60 * 60 * 1000),
      };
    },
    /** Favicon cache settings. */
    get favicon(): { max: number; ttl: number } {
      return {
        max: Number(Deno.env.get('DITTO_CACHE_FAVICON_MAX') || 500),
        ttl: Number(Deno.env.get('DITTO_CACHE_FAVICON_TTL') || 1 * 60 * 60 * 1000),
      };
    },
    /** Link preview cache settings. */
    get linkPreview(): { max: number; ttl: number } {
      return {
        max: Number(Deno.env.get('DITTO_CACHE_LINK_PREVIEW_MAX') || 1000),
        ttl: Number(Deno.env.get('DITTO_CACHE_LINK_PREVIEW_TTL') || 12 * 60 * 60 * 1000),
      };
    },
    /** Translation cache settings. */
    get translation(): { max: number; ttl: number } {
      return {
        max: Number(Deno.env.get('DITTO_CACHE_TRANSLATION_MAX') || 1000),
        ttl: Number(Deno.env.get('DITTO_CACHE_TRANSLATION_TTL') || 6 * 60 * 60 * 1000),
      };
    },
  };
  static profileFields = {
    get maxFields(): number {
      return Number(Deno.env.get('PROFILE_FIELDS_MAX_FIELDS') || 10);
    },
    get nameLength(): number {
      return Number(Deno.env.get('PROFILE_FIELDS_NAME_LENGTH') || 255);
    },
    get valueLength(): number {
      return Number(Deno.env.get('PROFILE_FIELDS_VALUE_LENGTH') || 2047);
    },
  };
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
