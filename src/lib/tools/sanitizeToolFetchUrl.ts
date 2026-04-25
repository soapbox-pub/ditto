/**
 * Validate that a URL is safe for the app or CORS proxy to fetch.
 *
 * This is stricter than `sanitizeUrl()` (which only checks for HTTPS and is
 * used for rendering event-sourced URLs in the DOM). This function additionally
 * rejects URLs targeting localhost, private networks, link-local addresses,
 * cloud metadata endpoints, and other non-public destinations.
 *
 * Returns the normalised `href` when allowed, or `undefined` when blocked.
 *
 * Limitations (documented for follow-up):
 * - Does not resolve DNS, so public hostnames that resolve to private IPs
 *   are not caught. The CORS proxy must enforce its own server-side checks.
 * - Does not follow redirects; a public URL that 3xx-redirects to a private
 *   target is not blocked here.
 */
export function sanitizeToolFetchUrl(raw: string | undefined | null): string | undefined {
  if (!raw) return undefined;

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return undefined;
  }

  if (parsed.protocol !== 'https:') return undefined;

  // Reject URL credentials — no legitimate fetch target needs them.
  if (parsed.username || parsed.password) return undefined;

  const hostname = parsed.hostname;

  // Reject localhost variants.
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost')
  ) {
    return undefined;
  }

  // Reject .local (mDNS) and .internal TLDs.
  if (
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal')
  ) {
    return undefined;
  }

  // Reject single-label hostnames (no dot) — likely internal names.
  if (!hostname.includes('.')) return undefined;

  // Check IPv4 literals (after new URL() normalization, always dotted-decimal).
  if (isBlockedIpv4(hostname)) return undefined;

  // Check IPv6 literals (URL.hostname strips brackets in browsers).
  if (hostname.startsWith('[') || hostname.includes(':')) {
    const bare = hostname.replace(/^\[|\]$/g, '');
    if (isBlockedIpv6(bare)) return undefined;
  }

  return parsed.href;
}

// ─── IPv4 ─────────────────────────────────────────────────────────────────────

/** Match a dotted-decimal IPv4 address. */
const IPV4_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

function isBlockedIpv4(hostname: string): boolean {
  const m = IPV4_RE.exec(hostname);
  if (!m) return false;

  const a = parseInt(m[1], 10);
  const b = parseInt(m[2], 10);

  // 0.0.0.0/8
  if (a === 0) return true;
  // 10.0.0.0/8
  if (a === 10) return true;
  // 100.64.0.0/10 (Carrier-grade NAT)
  if (a === 100 && b >= 64 && b <= 127) return true;
  // 127.0.0.0/8 (loopback)
  if (a === 127) return true;
  // 169.254.0.0/16 (link-local, cloud metadata)
  if (a === 169 && b === 254) return true;
  // 172.16.0.0/12
  if (a === 172 && b >= 16 && b <= 31) return true;
  // 192.0.0.0/24 (IETF protocol assignments)
  if (a === 192 && b === 0 && parseInt(m[3], 10) === 0) return true;
  // 192.168.0.0/16
  if (a === 192 && b === 168) return true;
  // 198.18.0.0/15 (benchmark)
  if (a === 198 && (b === 18 || b === 19)) return true;
  // 224.0.0.0/4 (multicast)
  if (a >= 224 && a <= 239) return true;
  // 240.0.0.0/4 (reserved)
  if (a >= 240) return true;

  return false;
}

// ─── IPv6 ─────────────────────────────────────────────────────────────────────

function isBlockedIpv6(addr: string): boolean {
  const lower = addr.toLowerCase();

  // ::1 (loopback)
  if (lower === '::1') return true;
  // :: (unspecified)
  if (lower === '::') return true;

  // fc00::/7 — unique local (ULA)
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true;
  // fe80::/10 — link-local
  if (lower.startsWith('fe80')) return true;
  // ff00::/8 — multicast
  if (lower.startsWith('ff')) return true;

  // IPv4-mapped IPv6: ::ffff:A.B.C.D or ::ffff:HHHH:HHHH
  // URL.hostname normalises these to e.g. "::ffff:7f00:1"
  // Check both the hex form and the mixed-notation form.
  const ffffPrefix = '::ffff:';
  if (lower.startsWith(ffffPrefix)) {
    const suffix = lower.slice(ffffPrefix.length);

    // Mixed notation: ::ffff:127.0.0.1
    if (IPV4_RE.test(suffix)) {
      return isBlockedIpv4(suffix);
    }

    // Hex notation: ::ffff:7f00:1 → convert to IPv4 and check.
    const hexParts = suffix.split(':');
    if (hexParts.length === 2) {
      const hi = parseInt(hexParts[0], 16);
      const lo = parseInt(hexParts[1], 16);
      if (!isNaN(hi) && !isNaN(lo)) {
        const ipv4 = `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
        return isBlockedIpv4(ipv4);
      }
    }
  }

  return false;
}
