/**
 * NIP-05 utility functions for formatting and parsing NIP-05 identifiers.
 */

/**
 * Formats a NIP-05 identifier for display.
 * - `_@domain.com` becomes `domain.com` (the `_@` prefix is the default/root user and shouldn't render)
 * - `user@domain.com` stays as `user@domain.com`
 */
export function formatNip05Display(nip05: string): string {
  if (nip05.startsWith('_@')) {
    return nip05.slice(2);
  }
  return nip05;
}

/**
 * Extracts the domain from a NIP-05 identifier.
 * `user@domain.com` → `domain.com`
 * `domain.com` → `domain.com` (a bare domain is the root user `_@domain.com`)
 */
export function getNip05Domain(nip05: string | undefined): string | undefined {
  if (!nip05) return undefined;
  const atIndex = nip05.indexOf('@');
  if (atIndex === -1) return nip05;
  return nip05.slice(atIndex + 1);
}

/**
 * Extracts the username portion from a NIP-05 identifier.
 * `user@domain.com` → `user`
 * `_@domain.com` → `_`
 * `domain.com` → `_`
 */
export function getNip05User(nip05: string): string {
  const atIndex = nip05.indexOf('@');
  if (atIndex === -1) return '_';
  return nip05.slice(0, atIndex);
}

/** A NIP-05 address, canonicalized: a bare `domain` is the root user `_@domain`. */
export interface Nip05Address {
  /** Local part. `_` for a bare domain. */
  name: string;
  domain: string;
  /** Canonical `name@domain`, the form the well-known lookup is keyed by. */
  address: string;
}

/** NIP-05 local part: the characters the spec allows in a `names` key. */
const NAME_RE = /^[a-z0-9\-_.]+$/i;
/**
 * Hostname with at least one dot, so unrouted single-segment paths
 * (`settings`) don't become NIP-05 lookups.
 */
const DOMAIN_RE = /^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i;

/**
 * Parse `name@domain`, a bare `domain` (→ `_@domain`), or `@name@domain`;
 * undefined otherwise. Ported from Armada.
 */
export function parseNip05Address(input: string): Nip05Address | undefined {
  const value = input.trim().replace(/^@/, '');
  if (!value) return undefined;

  const at = value.indexOf('@');
  const name = at === -1 ? '_' : value.slice(0, at);
  const rawDomain = at === -1 ? value : value.slice(at + 1);
  if (!NAME_RE.test(name) || !DOMAIN_RE.test(rawDomain)) return undefined;

  const domain = rawDomain.toLowerCase();
  return { name, domain, address: `${name}@${domain}` };
}
