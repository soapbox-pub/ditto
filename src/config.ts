/** Application-wide configuration. */
const Conf = {
  get nsec() {
    return Deno.env.get('DITTO_NSEC');
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
};

export { Conf };
