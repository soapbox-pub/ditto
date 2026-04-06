import { hmac } from '@noble/hashes/hmac';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';

import { hexToBase36 } from '@/lib/nsiteSubdomain';

const SEED_STORAGE_KEY = 'ditto:seed';

/**
 * Get or create a device-local random seed persisted in localStorage.
 * This is a general-purpose secret used to derive private identifiers
 * (e.g. iframe.diy subdomains) that must not be predictable by third parties.
 */
function getSeed(): string {
  const stored = localStorage.getItem(SEED_STORAGE_KEY);
  if (stored) return stored;

  const seed = crypto.randomUUID();
  localStorage.setItem(SEED_STORAGE_KEY, seed);
  return seed;
}

/**
 * Derive a stable, private subdomain label for an iframe.diy iframe.
 *
 * Uses HMAC-SHA256 with the device-local seed as the key and
 * `prefix|identifier` as the message. Because the seed is secret to
 * this device, a third party cannot predict or collide with another
 * app's subdomain, preventing cross-app localStorage/IndexedDB access
 * on iframe.diy.
 *
 * The `prefix` acts as a domain separator so that different use-cases
 * (e.g. "webxdc", "sandbox") produce distinct subdomains even for the
 * same identifier.
 *
 * The result is a 50-character base36 string (256 bits of entropy) that
 * fits within the 63-character subdomain label limit.
 */
export function deriveIframeSubdomain(prefix: string, identifier: string): string {
  const seed = getSeed();
  const enc = new TextEncoder();
  const mac = hmac(sha256, enc.encode(seed), enc.encode(`${prefix}|${identifier}`));
  return hexToBase36(bytesToHex(mac));
}
