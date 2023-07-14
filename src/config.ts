import { nip19, secp } from '@/deps.ts';

/** Application-wide configuration. */
const Conf = {
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
  get seckey() {
    const result = nip19.decode(Conf.nsec);
    if (result.type !== 'nsec') {
      throw new Error('Invalid DITTO_NSEC');
    }
    return result.data;
  },
  get cryptoKey() {
    return crypto.subtle.importKey(
      'raw',
      secp.utils.hexToBytes(Conf.seckey),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign', 'verify'],
    );
  },
  get relay() {
    return Deno.env.get('DITTO_RELAY');
  },
  get localDomain() {
    return Deno.env.get('LOCAL_DOMAIN') || 'http://localhost:8000';
  },
  get postCharLimit() {
    return Number(Deno.env.get('POST_CHAR_LIMIT') || 5000);
  },
  get adminEmail() {
    return Deno.env.get('ADMIN_EMAIL') || 'webmaster@localhost';
  },
  get poolRelays() {
    return (Deno.env.get('RELAY_POOL') || '').split(',').filter(Boolean);
  },
  get publishRelays() {
    return ['wss://relay.mostr.pub'];
  },
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
