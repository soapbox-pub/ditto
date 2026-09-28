/**
 * Validate that a string is a well-formed HTTPS URL.
 *
 * Returns the normalised `href` when valid, or `undefined` otherwise.
 * This **must** be used whenever a URL originates from untrusted Nostr
 * event data (tags, metadata fields, etc.) and will be placed into an
 * `href`, `window.open()`, or `openUrl()` call.  Without this check a
 * malicious `javascript:` URI could execute arbitrary code.
 */
export function sanitizeUrl(raw: string | undefined | null): string | undefined {
  if (!raw) return undefined;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol === 'https:') {
      return parsed.href;
    }
  } catch {
    // not a valid URL
  }
  return undefined;
}

/**
 * Returns a safe HTTPS URL only when it points to a host other than the app's
 * own. Used to decide whether to offer an "open externally" affordance: a link
 * back into our own host should navigate in-app, not pop a new tab. Returns
 * `undefined` for same-host, invalid, or non-HTTPS URLs.
 */
export function externalUrl(raw: string | undefined | null): string | undefined {
  const safe = sanitizeUrl(raw);
  if (!safe) return undefined;
  try {
    if (new URL(safe).host === location.host) return undefined;
  } catch {
    return undefined;
  }
  return safe;
}

/** Display hostname for a URL (drops a leading `www.`). Falls back to the raw
 *  string when it can't be parsed. */
export function displayHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/**
 * Whether a URL points at a loopback, private, or link-local address, or at a
 * name that only resolves on a local network.
 *
 * Event-sourced images at such an address (a leaked dev-instance emoji, e.g.
 * `http://localhost:8080/…`) make the page request a local address, which
 * trips Chrome's Local Network Access prompt for everyone who views the event
 * and lets a sender probe viewers' LANs. Unparseable input is not local.
 *
 * This goes by the URL alone. A public name that resolves to a private
 * address (`127.0.0.1.nip.io`, DNS rebinding) isn't caught; only the
 * browser, which sees the resolved address, can catch that.
 */
export function isLocalNetworkUrl(raw: string | undefined | null): boolean {
  if (!raw) return false;
  let host: string;
  try {
    host = new URL(raw).hostname.toLowerCase();
  } catch {
    return false;
  }
  let h = host
    .replace(/^\[|\]$/g, '') // strip IPv6 brackets
    .replace(/\.$/, ''); // `localhost.` is the same host as `localhost`
  if (h === 'localhost' || LOCAL_SUFFIXES.some((suffix) => h.endsWith(suffix))) return true;
  // A single-label name (`http://router/`) resolves through the LAN's search
  // domain. IPv4 in any spelling comes back from the parser dotted, and IPv6
  // has colons, so neither lands here.
  if (!h.includes('.') && !h.includes(':')) return true;
  if (h === '::1' || h === '::') return true; // loopback / unspecified
  // IPv4 embedded in IPv6 — mapped (::ffff:), NAT64 (64:ff9b::) or the old
  // compatible form (::) — reaches the same host by another spelling, and the
  // URL parser hands it back in hex (::ffff:7f00:1), matching no rule below.
  const embedded = /^(?:::ffff:(?:0:)?|64:ff9b::|::)([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(h);
  if (embedded) {
    const n = (parseInt(embedded[1], 16) << 16) | parseInt(embedded[2], 16);
    h = [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
  }
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (v4) {
    const a = Number(v4[1]);
    const b = Number(v4[2]);
    if (a === 127 || a === 10 || a === 0) return true; // loopback / private / "this host"
    if (a === 192 && b === 168) return true; // private
    if (a === 172 && b >= 16 && b <= 31) return true; // private
    if (a === 169 && b === 254) return true; // link-local
    if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
    if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking, often internal
    if (a === 192 && b === 0 && Number(v4[3]) === 0) return true; // IETF protocol assignments
  }
  if (/^f[cd][0-9a-f]*:/.test(h)) return true; // IPv6 unique-local fc00::/7
  if (/^fe[89ab][0-9a-f]*:/.test(h)) return true; // IPv6 link-local fe80::/10
  if (/^fe[c-f][0-9a-f]*:/.test(h)) return true; // IPv6 site-local fec0::/10 (deprecated, still routed internally)
  if (/^64:ff9b:1:/.test(h)) return true; // IPv6 local-use NAT64 64:ff9b:1::/48
  return false;
}

/** Name suffixes that only resolve on a local network. */
const LOCAL_SUFFIXES = ['.localhost', '.local', '.lan', '.internal', '.intranet', '.home.arpa'];
