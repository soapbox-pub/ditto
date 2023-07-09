/** Application-wide configuration. */
const Conf = {
  get nsec() {
    return Deno.env.get('DITTO_NSEC');
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
