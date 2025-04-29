import os from 'node:os';
import path from 'node:path';

import { NSecSigner } from '@nostrify/nostrify';
import { decodeBase64 } from '@std/encoding/base64';
import { encodeBase64Url } from '@std/encoding/base64url';
import ISO6391, { type LanguageCode } from 'iso-639-1';
import { nip19 } from 'nostr-tools';

import { getEcdsaPublicKey } from './utils/crypto.ts';
import { optionalBooleanSchema, optionalNumberSchema } from './utils/schema.ts';
import { mergeURLPath } from './utils/url.ts';

/** Ditto application-wide configuration. */
export class DittoConf {
  constructor(private env: { get(key: string): string | undefined }) {
    if (this.precheck) {
      const mediaUrl = new URL(this.mediaDomain);

      if (this.url.host === mediaUrl.host) {
        throw new Error(
          'For security reasons, MEDIA_DOMAIN cannot be on the same host as LOCAL_DOMAIN.\n\nTo disable this check, set DITTO_PRECHECK="false"',
        );
      }
    }
  }

  /** Cached parsed admin signer. */
  private _signer: NSecSigner | undefined;

  /** Cached parsed VAPID public key value. */
  private _vapidPublicKey: Promise<string | undefined> | undefined;

  /**
   * Ditto admin secret key in hex format.
   * @deprecated Use `signer` instead. TODO: handle auth tokens.
   */
  get seckey(): Uint8Array {
    const nsec = this.env.get('DITTO_NSEC');

    if (!nsec) {
      throw new Error('Missing DITTO_NSEC');
    }

    if (!nsec.startsWith('nsec1')) {
      throw new Error('Invalid DITTO_NSEC');
    }

    return nip19.decode(nsec as `nsec1${string}`).data;
  }

  /** Ditto admin signer. */
  get signer(): NSecSigner {
    if (!this._signer) {
      this._signer = new NSecSigner(this.seckey);
    }
    return this._signer;
  }

  /** Port to use when serving the HTTP server. */
  get port(): number {
    return parseInt(this.env.get('PORT') || '4036');
  }

  /** IP addresses not affected by rate limiting. */
  get ipWhitelist(): string[] {
    return this.env.get('IP_WHITELIST')?.split(',') || [];
  }

  /** Relay URL to the Ditto server's relay. */
  get relay(): `wss://${string}` | `ws://${string}` {
    const { protocol, host } = this.url;
    return `${protocol === 'https:' ? 'wss:' : 'ws:'}//${host}/relay`;
  }

  /** Relay to use for NIP-50 `search` queries. */
  get searchRelay(): string | undefined {
    return this.env.get('SEARCH_RELAY');
  }

  /** Origin of the Ditto server, including the protocol and port. */
  get localDomain(): string {
    return this.env.get('LOCAL_DOMAIN') || `http://localhost:${this.port}`;
  }

  /** Link to an external nostr viewer. */
  get externalDomain(): string {
    return this.env.get('NOSTR_EXTERNAL') || 'https://njump.me';
  }

  /** Get a link to a nip19-encoded entity in the configured external viewer. */
  external(path: string): string {
    return new URL(path, this.externalDomain).toString();
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
  get databaseUrl(): string {
    return this.env.get('DATABASE_URL') ?? 'file://data/pgdata';
  }

  /** PGlite debug level. 0 disables logging. */
  get pgliteDebug(): 0 | 1 | 2 | 3 | 4 | 5 {
    return Number(this.env.get('PGLITE_DEBUG') || 0) as 0 | 1 | 2 | 3 | 4 | 5;
  }

  get vapidPublicKey(): Promise<string | undefined> {
    if (!this._vapidPublicKey) {
      this._vapidPublicKey = (async () => {
        const keys = await this.vapidKeys;
        if (keys) {
          const { publicKey } = keys;
          const bytes = await crypto.subtle.exportKey('raw', publicKey);
          return encodeBase64Url(bytes);
        }
      })();
    }

    return this._vapidPublicKey;
  }

  get vapidKeys(): Promise<CryptoKeyPair | undefined> {
    return (async () => {
      const encoded = this.env.get('VAPID_PRIVATE_KEY');

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

  get db(): { timeouts: { default: number; relay: number; timelines: number } } {
    const env = this.env;
    return {
      /** Database query timeout configurations. */
      timeouts: {
        /** Default query timeout when another setting isn't more specific. */
        get default(): number {
          return Number(env.get('DB_TIMEOUT_DEFAULT') || 5_000);
        },
        /** Timeout used for queries made through the Nostr relay. */
        get relay(): number {
          return Number(env.get('DB_TIMEOUT_RELAY') || 1_000);
        },
        /** Timeout used for timelines such as home, notifications, hashtag, etc. */
        get timelines(): number {
          return Number(env.get('DB_TIMEOUT_TIMELINES') || 15_000);
        },
      },
    };
  }

  /** Time-to-live for captchas in milliseconds. */
  get captchaTTL(): number {
    return Number(this.env.get('CAPTCHA_TTL') || 5 * 60 * 1000);
  }

  /** Character limit to enforce for posts made through Mastodon API. */
  get postCharLimit(): number {
    return Number(this.env.get('POST_CHAR_LIMIT') || 5000);
  }

  /** S3 media storage configuration. */
  get s3(): {
    endPoint?: string;
    region?: string;
    accessKey?: string;
    secretKey?: string;
    bucket?: string;
    pathStyle?: boolean;
    port?: number;
    sessionToken?: string;
    useSSL?: boolean;
  } {
    const env = this.env;

    return {
      get endPoint(): string | undefined {
        return env.get('S3_ENDPOINT');
      },
      get region(): string | undefined {
        return env.get('S3_REGION');
      },
      get accessKey(): string | undefined {
        return env.get('S3_ACCESS_KEY');
      },
      get secretKey(): string | undefined {
        return env.get('S3_SECRET_KEY');
      },
      get bucket(): string | undefined {
        return env.get('S3_BUCKET');
      },
      get pathStyle(): boolean | undefined {
        return optionalBooleanSchema.parse(env.get('S3_PATH_STYLE'));
      },
      get port(): number | undefined {
        return optionalNumberSchema.parse(env.get('S3_PORT'));
      },
      get sessionToken(): string | undefined {
        return env.get('S3_SESSION_TOKEN');
      },
      get useSSL(): boolean | undefined {
        return optionalBooleanSchema.parse(env.get('S3_USE_SSL'));
      },
    };
  }

  /** IPFS uploader configuration. */
  get ipfs(): { apiUrl: string } {
    const env = this.env;

    return {
      /** Base URL for private IPFS API calls. */
      get apiUrl(): string {
        return env.get('IPFS_API_URL') || 'http://localhost:5001';
      },
    };
  }

  /**
   * The logging configuration for the Ditto server. The config is derived from
   * the DEBUG environment variable and it is parsed as follows:
   *
   * `DEBUG='<jsonl|pretty>:<minimum log level to show>:comma-separated scopes to show'`.
   * If the scopes are empty (e.g. in 'pretty:warn:', then all scopes are shown.)
   */
  get logConfig(): {
    fmt: 'jsonl' | 'pretty';
    level: string;
    scopes: string[];
  } {
    let [fmt, level, scopes] = (this.env.get('LOG_CONFIG') || '').split(':');
    fmt ||= 'jsonl';
    level ||= 'debug';
    scopes ||= '';

    if (fmt !== 'jsonl' && fmt !== 'pretty') fmt = 'jsonl';

    return {
      fmt: fmt as 'jsonl' | 'pretty',
      level,
      scopes: scopes.split(',').filter(Boolean),
    };
  }

  /** nostr.build API endpoint when the `nostrbuild` uploader is used. */
  get nostrbuildEndpoint(): string {
    return this.env.get('NOSTRBUILD_ENDPOINT') || 'https://nostr.build/api/v2/upload/files';
  }

  /** Default Blossom servers to use when the `blossom` uploader is set. */
  get blossomServers(): string[] {
    return this.env.get('BLOSSOM_SERVERS')?.split(',') || ['https://blossom.primal.net/'];
  }

  /** Module to upload files with. */
  get uploader(): string | undefined {
    return this.env.get('DITTO_UPLOADER');
  }

  /** Location to use for local uploads. */
  get uploadsDir(): string {
    return this.env.get('UPLOADS_DIR') || 'data/uploads';
  }

  /** Media base URL for uploads. */
  get mediaDomain(): string {
    const value = this.env.get('MEDIA_DOMAIN');

    if (!value) {
      const url = this.url;
      url.host = `media.${url.host}`;
      return url.toString();
    }

    return value;
  }

  /**
   * Whether to analyze media metadata with [blurhash](https://www.npmjs.com/package/blurhash) and [sharp](https://www.npmjs.com/package/sharp).
   * This is prone to security vulnerabilities, which is why it's not enabled by default.
   */
  get mediaAnalyze(): boolean {
    return optionalBooleanSchema.parse(this.env.get('MEDIA_ANALYZE')) ?? false;
  }

  /** Whether to transcode uploaded video files with ffmpeg. */
  get mediaTranscode(): boolean {
    return optionalBooleanSchema.parse(this.env.get('MEDIA_TRANSCODE')) ?? false;
  }

  /** Max upload size for files in number of bytes. Default 100MiB. */
  get maxUploadSize(): number {
    return Number(this.env.get('MAX_UPLOAD_SIZE') || 100 * 1024 * 1024);
  }

  /** Usernames that regular users cannot sign up with. */
  get forbiddenUsernames(): string[] {
    return this.env.get('FORBIDDEN_USERNAMES')?.split(',') || [
      '_',
      'admin',
      'administrator',
      'root',
      'sysadmin',
      'system',
    ];
  }

  /** Domain of the Ditto server as a `URL` object, for easily grabbing the `hostname`, etc. */
  get url(): URL {
    return new URL(this.localDomain);
  }

  /** Merges the path with the localDomain. */
  local(path: string): string {
    return mergeURLPath(this.localDomain, path);
  }

  /** URL to send Sentry errors to. */
  get sentryDsn(): string | undefined {
    return this.env.get('SENTRY_DSN');
  }

  /** Postgres settings. */
  get pg(): { poolSize: number } {
    const env = this.env;

    return {
      /** Number of connections to use in the pool. */
      get poolSize(): number {
        return Number(env.get('PG_POOL_SIZE') ?? 20);
      },
    };
  }

  /** Whether to enable requesting events from known relays. */
  get firehoseEnabled(): boolean {
    return optionalBooleanSchema.parse(this.env.get('FIREHOSE_ENABLED')) ?? true;
  }

  /** Number of events the firehose is allowed to process at one time before they have to wait in a queue. */
  get firehoseConcurrency(): number {
    return Math.ceil(Number(this.env.get('FIREHOSE_CONCURRENCY') ?? 1));
  }

  /** Nostr event kinds of events to listen for on the firehose. */
  get firehoseKinds(): number[] {
    return (this.env.get('FIREHOSE_KINDS') ?? '0, 1, 3, 5, 6, 7, 20, 9735, 10002')
      .split(/[, ]+/g)
      .map(Number);
  }

  /**
   * Whether Ditto should subscribe to Nostr events from the Postgres database itself.
   * This would make Nostr events inserted directly into Postgres available to the streaming API and relay.
   */
  get notifyEnabled(): boolean {
    return optionalBooleanSchema.parse(this.env.get('NOTIFY_ENABLED')) ?? true;
  }

  /** Whether to enable Ditto cron jobs. */
  get cronEnabled(): boolean {
    return optionalBooleanSchema.parse(this.env.get('CRON_ENABLED')) ?? true;
  }

  /** User-Agent to use when fetching link previews. Pretend to be Facebook by default. */
  get fetchUserAgent(): string {
    return this.env.get('DITTO_FETCH_USER_AGENT') ?? 'facebookexternalhit';
  }

  /** Path to the custom policy module. Must be an absolute path, https:, npm:, or jsr: URI. */
  get policy(): string {
    return this.env.get('DITTO_POLICY') || path.join(this.dataDir, 'policy.ts');
  }

  /** Absolute path to the data directory used by Ditto. */
  get dataDir(): string {
    return this.env.get('DITTO_DATA_DIR') || path.join(Deno.cwd(), 'data');
  }

  /** Absolute path of the Deno directory. */
  get denoDir(): string {
    return this.env.get('DENO_DIR') || `${os.userInfo().homedir}/.cache/deno`;
  }

  /** Whether zap splits should be enabled. */
  get zapSplitsEnabled(): boolean {
    return optionalBooleanSchema.parse(this.env.get('ZAP_SPLITS_ENABLED')) ?? false;
  }

  /** Languages this server wishes to highlight. Used when querying trends.*/
  get preferredLanguages(): LanguageCode[] | undefined {
    return this.env.get('DITTO_LANGUAGES')?.split(',')?.filter(ISO6391.validate);
  }

  /** Mints to be displayed in the UI when the user decides to create a wallet.*/
  get cashuMints(): string[] {
    return this.env.get('CASHU_MINTS')?.split(',') ?? [];
  }

  /** Translation provider used to translate posts. */
  get translationProvider(): string | undefined {
    return this.env.get('TRANSLATION_PROVIDER');
  }

  /** DeepL URL endpoint. */
  get deeplBaseUrl(): string | undefined {
    return this.env.get('DEEPL_BASE_URL');
  }

  /** DeepL API KEY. */
  get deeplApiKey(): string | undefined {
    return this.env.get('DEEPL_API_KEY');
  }

  /** LibreTranslate URL endpoint. */
  get libretranslateBaseUrl(): string | undefined {
    return this.env.get('LIBRETRANSLATE_BASE_URL');
  }

  /** LibreTranslate API KEY. */
  get libretranslateApiKey(): string | undefined {
    return this.env.get('LIBRETRANSLATE_API_KEY');
  }

  /** Cache settings. */
  get caches(): {
    nip05: { max: number; ttl: number };
    favicon: { max: number; ttl: number };
    translation: { max: number; ttl: number };
  } {
    const env = this.env;

    return {
      /** NIP-05 cache settings. */
      get nip05(): { max: number; ttl: number } {
        return {
          max: Number(env.get('DITTO_CACHE_NIP05_MAX') || 3000),
          ttl: Number(env.get('DITTO_CACHE_NIP05_TTL') || 1 * 60 * 60 * 1000),
        };
      },
      /** Favicon cache settings. */
      get favicon(): { max: number; ttl: number } {
        return {
          max: Number(env.get('DITTO_CACHE_FAVICON_MAX') || 500),
          ttl: Number(env.get('DITTO_CACHE_FAVICON_TTL') || 1 * 60 * 60 * 1000),
        };
      },
      /** Translation cache settings. */
      get translation(): { max: number; ttl: number } {
        return {
          max: Number(env.get('DITTO_CACHE_TRANSLATION_MAX') || 1000),
          ttl: Number(env.get('DITTO_CACHE_TRANSLATION_TTL') || 6 * 60 * 60 * 1000),
        };
      },
    };
  }

  /** Custom profile fields configuration. */
  get profileFields(): { maxFields: number; nameLength: number; valueLength: number } {
    const env = this.env;

    return {
      get maxFields(): number {
        return Number(env.get('PROFILE_FIELDS_MAX_FIELDS') || 10);
      },
      get nameLength(): number {
        return Number(env.get('PROFILE_FIELDS_NAME_LENGTH') || 255);
      },
      get valueLength(): number {
        return Number(env.get('PROFILE_FIELDS_VALUE_LENGTH') || 2047);
      },
    };
  }

  /** Maximum time between events before a streak is broken, *in seconds*. */
  get streakWindow(): number {
    return Number(this.env.get('STREAK_WINDOW') || 129600);
  }

  /** Whether to perform security/configuration checks on startup. */
  get precheck(): boolean {
    return optionalBooleanSchema.parse(this.env.get('DITTO_PRECHECK')) ?? true;
  }

  /** Path to `ffmpeg` executable. */
  get ffmpegPath(): string {
    return this.env.get('FFMPEG_PATH') || 'ffmpeg';
  }

  /** Path to `ffprobe` executable. */
  get ffprobePath(): string {
    return this.env.get('FFPROBE_PATH') || 'ffprobe';
  }
}
