/**
 * BIP352 Silent Payments — dependency-light core.
 *
 * Address decoding and validation for silent payment addresses (`sp1…`
 * mainnet, `tsp1…` testnets), plus the bech32m (BIP350) primitives shared
 * with the encode side in `@/lib/silentPayments`.
 *
 * This module is deliberately free of `@scure/btc-signer` so callers on the
 * initial-load path (payment-target validation, campaign parsing) can
 * validate addresses without pulling the ~150 kB transaction-signing stack
 * into the entry bundle. Its only dependency is `@noble/curves/secp256k1`,
 * which is already loaded eagerly via `nostr-tools`.
 *
 * The full sender-side derivation (ECDH, output tweaking, PSBT plumbing)
 * lives in `@/lib/silentPayments`, which re-exports everything here.
 */
import { secp256k1 } from '@noble/curves/secp256k1';

/**
 * secp256k1 Point class (used for compressed-point validation).
 *
 * `@noble/curves` v1 exposes the projective-point constructor as
 * `secp256k1.ProjectivePoint`; v2 moved it to `schnorr.Point`. We use the
 * v1 export to match the rest of the ditto codebase.
 */
const Point = secp256k1.ProjectivePoint;

// ---------------------------------------------------------------------------
// bech32m (BIP350) — variant for silent payment addresses (BIP352)
// ---------------------------------------------------------------------------
//
// BIP352 uses bech32m, but unlike segwit addresses (BIP173/BIP350):
//   - the witness version may be 0..31 (segwit caps at 0..16),
//   - the encoded payload has no 90-char hard limit; a 1023-char ceiling is
//     suggested for forward compatibility,
//   - the HRP is "sp" / "tsp" rather than "bc" / "tb".
//
// We therefore can't reuse bech32 from a segwit library and must implement
// the small bit of base32+checksum logic ourselves.

export const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';

/** Reverse lookup table for CHARSET (-1 for invalid characters). */
const CHARSET_REV: Int8Array = (() => {
  const arr = new Int8Array(128).fill(-1);
  for (let i = 0; i < CHARSET.length; i++) {
    arr[CHARSET.charCodeAt(i)] = i;
  }
  return arr;
})();

export const BECH32M_CONST = 0x2bc830a3;

export function polymod(values: number[]): number {
  const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let chk = 1;
  for (const v of values) {
    const top = chk >>> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) {
      if ((top >>> i) & 1) chk ^= GEN[i];
    }
  }
  return chk;
}

export function hrpExpand(hrp: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < hrp.length; i++) out.push(hrp.charCodeAt(i) >>> 5);
  out.push(0);
  for (let i = 0; i < hrp.length; i++) out.push(hrp.charCodeAt(i) & 0x1f);
  return out;
}

export function verifyBech32mChecksum(hrp: string, data: number[]): boolean {
  return polymod(hrpExpand(hrp).concat(data)) === BECH32M_CONST;
}

/** Convert a stream of 5-bit groups to 8-bit groups (the address payload). */
export function convertBits5to8(data: number[]): Uint8Array {
  let acc = 0;
  let bits = 0;
  const out: number[] = [];
  for (const v of data) {
    if (v < 0 || v > 31) throw new Error('Silent payment address: invalid 5-bit value.');
    acc = (acc << 5) | v;
    bits += 5;
    while (bits >= 8) {
      bits -= 8;
      out.push((acc >>> bits) & 0xff);
    }
  }
  // Leftover bits must be zero and fewer than 5 (canonical encoding).
  if (bits >= 5) throw new Error('Silent payment address: non-canonical padding.');
  if (((acc << (8 - bits)) & 0xff) !== 0) {
    throw new Error('Silent payment address: non-zero padding bits.');
  }
  return Uint8Array.from(out);
}

/** True iff `bytes` is a 33-byte compressed secp256k1 point on the curve. */
export function isValidCompressedPoint(bytes: Uint8Array): boolean {
  if (bytes.length !== 33) return false;
  if (bytes[0] !== 0x02 && bytes[0] !== 0x03) return false;
  try {
    Point.fromHex(bytes);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Silent payment address decoding
// ---------------------------------------------------------------------------

/** Network of a silent payment address. */
export type SilentPaymentNetwork = 'mainnet' | 'testnet';

/** A decoded silent payment address. */
export interface SilentPaymentAddress {
  /** Bech32m HRP. `"sp"` for mainnet, `"tsp"` for testnet/signet/regtest. */
  hrp: string;
  network: SilentPaymentNetwork;
  /** Silent-payment-version (0 for `sp1q…`). */
  version: number;
  /**
   * Receiver's scan pubkey (33-byte compressed sec).
   * Used as the multiplicand in the ECDH step.
   */
  scanPubKey: Uint8Array;
  /**
   * Receiver's spend pubkey (33-byte compressed sec). When the address is
   * labelled, this is the labelled `B_m`, not the raw `B_spend`. From the
   * sender's perspective the two are interchangeable.
   */
  spendPubKey: Uint8Array;
}

/** Cheap pre-check: does this look like a silent payment address at all? */
export function isSilentPaymentAddress(s: string): boolean {
  if (typeof s !== 'string') return false;
  const lower = s.toLowerCase();
  return lower.startsWith('sp1') || lower.startsWith('tsp1');
}

/**
 * Decode a BIP352 silent payment address.
 *
 * Throws on:
 *   - mixed case,
 *   - invalid characters,
 *   - bad checksum,
 *   - unknown HRP,
 *   - version 31 (reserved for breaking changes),
 *   - data part shorter than 66 bytes after the version,
 *   - silent payment v0 with a payload that isn't exactly 66 bytes,
 *   - scan or spend pubkey not on the curve.
 *
 * The decoder accepts (but ignores) trailing bytes for v1–v30 per the BIP's
 * forward-compatibility rule.
 */
export function decodeSilentPaymentAddress(addr: string): SilentPaymentAddress {
  if (typeof addr !== 'string' || addr.length === 0) {
    throw new Error('Silent payment address: empty string.');
  }
  if (addr.length > 1023) {
    throw new Error('Silent payment address: too long.');
  }

  // BIP173 forbids mixed case.
  if (addr.toLowerCase() !== addr && addr.toUpperCase() !== addr) {
    throw new Error('Silent payment address: mixed case.');
  }
  const lower = addr.toLowerCase();

  const sepIndex = lower.lastIndexOf('1');
  if (sepIndex < 1) {
    throw new Error('Silent payment address: missing separator.');
  }

  const hrp = lower.slice(0, sepIndex);
  const dataPart = lower.slice(sepIndex + 1);
  if (dataPart.length < 7) {
    throw new Error('Silent payment address: data part too short.');
  }

  let network: SilentPaymentNetwork;
  if (hrp === 'sp') network = 'mainnet';
  else if (hrp === 'tsp') network = 'testnet';
  else throw new Error(`Silent payment address: unknown HRP "${hrp}".`);

  // HRP must contain only printable ASCII outside the bech32 separator range.
  for (let i = 0; i < hrp.length; i++) {
    const c = hrp.charCodeAt(i);
    if (c < 33 || c > 126) {
      throw new Error('Silent payment address: HRP contains invalid character.');
    }
  }

  const data: number[] = [];
  for (let i = 0; i < dataPart.length; i++) {
    const v = CHARSET_REV[dataPart.charCodeAt(i)];
    if (v === -1) {
      throw new Error('Silent payment address: invalid character in data part.');
    }
    data.push(v);
  }

  if (!verifyBech32mChecksum(hrp, data)) {
    throw new Error('Silent payment address: invalid checksum.');
  }

  // Strip the 6-character checksum, then split off the 1-character version.
  const payloadWithVersion = data.slice(0, data.length - 6);
  const version = payloadWithVersion[0];
  if (version > 31) throw new Error('Silent payment address: invalid version.');
  if (version === 31) {
    throw new Error('Silent payment address: reserved version 31.');
  }

  const payload5 = payloadWithVersion.slice(1);
  const payload = convertBits5to8(payload5);

  if (version === 0) {
    if (payload.length !== 66) {
      throw new Error(
        `Silent payment v0: data part must be exactly 66 bytes (got ${payload.length}).`,
      );
    }
  } else {
    if (payload.length < 66) {
      throw new Error(
        `Silent payment v${version}: data part must be at least 66 bytes (got ${payload.length}).`,
      );
    }
  }

  const scanPubKey = payload.slice(0, 33);
  const spendPubKey = payload.slice(33, 66);

  if (!isValidCompressedPoint(scanPubKey)) {
    throw new Error('Silent payment address: scan key is not a valid compressed point.');
  }
  if (!isValidCompressedPoint(spendPubKey)) {
    throw new Error('Silent payment address: spend key is not a valid compressed point.');
  }

  return { hrp, network, version, scanPubKey, spendPubKey };
}

/**
 * Best-effort validator. Returns `true` iff the string is a syntactically
 * valid silent payment address (bech32m + curve checks). Use for inline
 * form validation where pickers may speculatively check half-typed addresses
 * and a thrown error is the wrong UX signal.
 */
export function validateSilentPaymentAddress(addr: string): boolean {
  try {
    decodeSilentPaymentAddress(addr);
    return true;
  } catch {
    return false;
  }
}
