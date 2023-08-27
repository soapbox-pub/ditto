import { dotenv, getPublicKey, nip19, secp } from '@/deps.ts';

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
  /** Domain of the Ditto server, including the protocol. */
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
  /** @deprecated Use relays from the database instead. */
  get poolRelays() {
    return (Deno.env.get('RELAY_POOL') || '').split(',').filter(Boolean);
  },
  /** @deprecated Publish only to the local relay unless users are mentioned, then try to also send to the relay of those users. Deletions should also be fanned out. */
  get publishRelays() {
    return ['wss://relay.mostr.pub'];
  },
  /** Domain of the Ditto server as a `URL` object, for easily grabbing the `hostname`, etc. */
  get url() {
    return new URL(Conf.localDomain);
  },
  /** Merges the path with the localDomain. */
  local(path: string): string {
    if (path.startsWith('/')) {
      // Path is a path.
      return new URL(path, Conf.localDomain).toString();
    } else {
      // Path is possibly a full URL. Replace the domain.
      const { pathname } = new URL(path);
      return new URL(pathname, Conf.localDomain).toString();
    }
  },
};

export { Conf };
