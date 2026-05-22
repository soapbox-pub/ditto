/**
 * BIP-352 Silent Payment address decoder.
 *
 * Decodes the bech32m-encoded `sp1…` (mainnet) and `tsp1…` (testnet/signet)
 * silent payment addresses defined by BIP-352, returning the receiver's
 * 33-byte compressed scan and spend public keys. We don't derive on-chain
 * outputs from these addresses here — that's the signer's job under
 * BIP-375 (see {@link "./bitcoin".buildUnsignedSilentPaymentPsbt}).
 *
 * The bech32m variant used by BIP-352 differs from segwit (BIP-173/BIP-350):
 *
 *   - witness version may be 0..30 (segwit caps at 0..16; 31 is reserved
 *     for breaking changes),
 *   - the encoded payload has no 90-char hard limit; a 1023-char ceiling
 *     is suggested for forward compatibility,
 *   - the HRP is "sp" / "tsp" rather than "bc" / "tb".
 *
 * We therefore can't reuse a segwit-tuned bech32 helper and implement the
 * small bit of base32+checksum logic inline. Curve-point validation is
 * delegated to `@noble/curves`.
 */
import { secp256k1 } from '@noble/curves/secp256k1';
import { sha256 } from '@noble/hashes/sha256';

/** Curve point class used to validate scan/spend pubkeys. */
const Point = secp256k1.ProjectivePoint;

// ---------------------------------------------------------------------------
// bech32m (BIP-350) — variant for silent payment addresses (BIP-352)
// ---------------------------------------------------------------------------

const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';

/** Reverse lookup table for CHARSET (-1 for invalid characters). */
const CHARSET_REV: Int8Array = (() => {
  const arr = new Int8Array(128).fill(-1);
  for (let i = 0; i < CHARSET.length; i++) {
    arr[CHARSET.charCodeAt(i)] = i;
  }
  return arr;
})();

const BECH32M_CONST = 0x2bc830a3;

function polymod(values: number[]): number {
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

function hrpExpand(hrp: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < hrp.length; i++) out.push(hrp.charCodeAt(i) >>> 5);
  out.push(0);
  for (let i = 0; i < hrp.length; i++) out.push(hrp.charCodeAt(i) & 0x1f);
  return out;
}

function verifyBech32mChecksum(hrp: string, data: number[]): boolean {
  return polymod(hrpExpand(hrp).concat(data)) === BECH32M_CONST;
}

/** Convert a stream of 5-bit groups to 8-bit groups (the address payload). */
function convertBits5to8(data: number[]): Uint8Array {
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

/**
 * Cheap pre-check: does this look like a silent payment address at all?
 *
 * Use for routing in the UI before committing to a full bech32m decode. A
 * `true` here does not guarantee {@link decodeSilentPaymentAddress} will
 * succeed — it only filters out the obvious non-candidates.
 */
export function isSilentPaymentAddress(s: string): boolean {
  if (typeof s !== 'string') return false;
  const lower = s.toLowerCase();
  return lower.startsWith('sp1') || lower.startsWith('tsp1');
}

/** True iff `bytes` is a 33-byte compressed secp256k1 point on the curve. */
function isValidCompressedPoint(bytes: Uint8Array): boolean {
  if (bytes.length !== 33) return false;
  if (bytes[0] !== 0x02 && bytes[0] !== 0x03) return false;
  try {
    Point.fromHex(bytes);
    return true;
  } catch {
    return false;
  }
}

/**
 * Decode a BIP-352 silent payment address.
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
 * The decoder accepts (but ignores) trailing bytes for v1–v30 per the
 * BIP's forward-compatibility rule.
 */
export function decodeSilentPaymentAddress(addr: string): SilentPaymentAddress {
  if (typeof addr !== 'string' || addr.length === 0) {
    throw new Error('Silent payment address: empty string.');
  }
  if (addr.length > 1023) {
    throw new Error('Silent payment address: too long.');
  }

  // BIP-173 forbids mixed case.
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
  } else if (payload.length < 66) {
    throw new Error(
      `Silent payment v${version}: data part must be at least 66 bytes (got ${payload.length}).`,
    );
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
 * valid silent payment address (bech32m + curve checks).
 */
export function validateSilentPaymentAddress(addr: string): boolean {
  try {
    decodeSilentPaymentAddress(addr);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// BIP-352 sender output derivation (local nsec fallback)
// ---------------------------------------------------------------------------
//
// When the active signer is a local nsec we own the private key and can
// resolve the silent payment output to a concrete BIP-341 taproot output
// ourselves, bypassing the need for BIP-375 PSBT v2 fields. NIP-07 / NIP-46
// signers do this internally — see `NSecSignerBtc.signPsbt` for the
// integration point.

const SECP_N =
  0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;

/** Tagged hash (BIP-340 style): SHA256(SHA256(tag) || SHA256(tag) || msg). */
function taggedHash(tag: string, msg: Uint8Array): Uint8Array {
  // `new TextEncoder().encode()` returns a Uint8Array, but in jsdom the
  // returned instance is from a different realm than noble's internal
  // `u8a` check — so we copy into a fresh `new Uint8Array(…)` to ensure
  // the prototype matches. Same applies to the message we receive.
  const tagBytes = new Uint8Array(new TextEncoder().encode(tag));
  const tagHash = sha256(tagBytes);
  const data = new Uint8Array(tagHash.length * 2 + msg.length);
  data.set(tagHash, 0);
  data.set(tagHash, tagHash.length);
  data.set(msg, tagHash.length * 2);
  return sha256(data);
}

function concatBytes(...arrs: Uint8Array[]): Uint8Array {
  let len = 0;
  for (const a of arrs) len += a.length;
  const out = new Uint8Array(len);
  let off = 0;
  for (const a of arrs) {
    out.set(a, off);
    off += a.length;
  }
  return out;
}

function compareBytes(a: Uint8Array, b: Uint8Array): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return a.length - b.length;
}

function bytesToScalar(b: Uint8Array): bigint {
  let v = 0n;
  for (const byte of b) v = (v << 8n) | BigInt(byte);
  return v;
}

function scalarToBytes(s: bigint): Uint8Array {
  if (s <= 0n || s >= SECP_N) throw new Error('Scalar out of range.');
  const out = new Uint8Array(32);
  let v = s;
  for (let i = 31; i >= 0; i--) {
    out[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return out;
}

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error('hexToBytes: odd-length string.');
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    const b = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    if (Number.isNaN(b)) throw new Error('hexToBytes: invalid character.');
    out[i] = b;
  }
  return out;
}

function pubKeyFromScalar(privateKey: Uint8Array): Uint8Array {
  const k = bytesToScalar(privateKey);
  if (k === 0n || k >= SECP_N) {
    throw new Error('Silent payment: invalid input private key.');
  }
  return Point.BASE.multiply(k).toRawBytes(true);
}

function privateNegate(privateKey: Uint8Array): Uint8Array {
  const k = bytesToScalar(privateKey);
  if (k === 0n || k >= SECP_N) {
    throw new Error('Silent payment: invalid input private key.');
  }
  return scalarToBytes(SECP_N - k);
}

function u32be(n: number): Uint8Array {
  const b = new Uint8Array(4);
  b[0] = (n >>> 24) & 0xff;
  b[1] = (n >>> 16) & 0xff;
  b[2] = (n >>> 8) & 0xff;
  b[3] = n & 0xff;
  return b;
}

/**
 * Serialize an outpoint as it appears in a Bitcoin transaction:
 * 32-byte little-endian txid || 4-byte little-endian vout.
 *
 * `txidHex` is in display order (big-endian) — the form everywhere in
 * Esplora / mempool.space / RPC clients.
 */
function serializeOutpoint(txidHex: string, vout: number): Uint8Array {
  if (!/^[0-9a-fA-F]{64}$/.test(txidHex)) {
    throw new Error('outpoint: txid must be 32-byte hex.');
  }
  const txid = hexToBytes(txidHex);
  txid.reverse(); // display → internal byte order
  const voutBuf = new Uint8Array(4);
  voutBuf[0] = vout & 0xff;
  voutBuf[1] = (vout >>> 8) & 0xff;
  voutBuf[2] = (vout >>> 16) & 0xff;
  voutBuf[3] = (vout >>> 24) & 0xff;
  return concatBytes(txid, voutBuf);
}

/**
 * A single sender input that contributes to BIP-352 ECDH.
 *
 * `privateKey` is the input's signing private key. For Taproot inputs this
 * is the BIP-341 *tweaked* key (the same scalar used to produce the Schnorr
 * signature), NOT the untweaked Nostr-style internal key.
 *
 * `isTaproot` flips the negate-if-odd-Y rule on (BIP-352 §"Creating outputs").
 */
export interface SilentPaymentInput {
  txid: string;
  vout: number;
  privateKey: Uint8Array;
  isTaproot: boolean;
}

/**
 * Derive a single BIP-341 taproot output (32-byte x-only key) for a given
 * silent payment address and the sender's input set.
 *
 * Used by `NSecSignerBtc.signPsbt` to resolve `PSBT_OUT_SP_V0_INFO` outputs
 * locally — bypassing the need for an external BIP-375-capable signer when
 * the user logged in with their nsec.
 *
 * Throws if:
 *   - no eligible inputs are given,
 *   - the summed private key is zero,
 *   - `input_hash` or `t_k` is an invalid scalar,
 *   - `B_spend + t_k·G` is the point at infinity.
 */
export function deriveSilentPaymentOutputScript(
  eligibleInputs: SilentPaymentInput[],
  address: SilentPaymentAddress,
  options: {
    /**
     * Outpoints of every input in the transaction. BIP-352 picks the
     * lexicographically smallest one across ALL inputs (not just eligible
     * ones) for `input_hash`. Defaults to the outpoints of
     * `eligibleInputs`.
     */
    allOutpoints?: { txid: string; vout: number }[];
    /** `k` index within the recipient scan-key group. Defaults to 0. */
    k?: number;
  } = {},
): Uint8Array {
  if (eligibleInputs.length === 0) {
    throw new Error('Silent payment: at least one eligible input is required.');
  }
  const k = options.k ?? 0;

  // ── Step 1: a = Σ a_i, with parity flip on Taproot inputs ──
  let aSum = 0n;
  for (const input of eligibleInputs) {
    if (input.privateKey.length !== 32) {
      throw new Error('Silent payment: input private key must be 32 bytes.');
    }
    let pk = input.privateKey;
    if (input.isTaproot) {
      const pub = pubKeyFromScalar(pk);
      if (pub[0] === 0x03) pk = privateNegate(pk);
    }
    const scalar = bytesToScalar(pk);
    if (scalar === 0n || scalar >= SECP_N) {
      throw new Error('Silent payment: input private key out of range.');
    }
    aSum = (aSum + scalar) % SECP_N;
  }
  if (aSum === 0n) {
    throw new Error('Silent payment: sum of input private keys is zero.');
  }
  const aPub = Point.BASE.multiply(aSum).toRawBytes(true);

  // ── Step 2: outpoint_L = lex-smallest serialized outpoint ──
  const outpoints = options.allOutpoints ?? eligibleInputs.map((i) => ({ txid: i.txid, vout: i.vout }));
  if (outpoints.length === 0) throw new Error('Silent payment: no outpoints provided.');
  let smallest: Uint8Array | null = null;
  for (const op of outpoints) {
    const ser = serializeOutpoint(op.txid, op.vout);
    if (smallest === null || compareBytes(ser, smallest) < 0) smallest = ser;
  }
  if (!smallest) throw new Error('Silent payment: no outpoints.');

  // ── Step 3: input_hash = hashBIP0352/Inputs(outpoint_L || A) ──
  const inputHash = taggedHash('BIP0352/Inputs', concatBytes(smallest, aPub));
  const inputHashScalar = bytesToScalar(inputHash);
  if (inputHashScalar === 0n || inputHashScalar >= SECP_N) {
    throw new Error('Silent payment: invalid input_hash.');
  }

  // ── Step 4: ecdh = input_hash · a · B_scan ──
  const scanPoint = Point.fromHex(address.scanPubKey);
  const combinedScalar = (inputHashScalar * aSum) % SECP_N;
  if (combinedScalar === 0n) {
    throw new Error('Silent payment: input_hash · a is zero.');
  }
  const ecdh = scanPoint.multiply(combinedScalar).toRawBytes(true);

  // ── Step 5: t_k = hashBIP0352/SharedSecret(serP(ecdh) || ser32(k)) ──
  const tK = taggedHash('BIP0352/SharedSecret', concatBytes(ecdh, u32be(k)));
  const tScalar = bytesToScalar(tK);
  if (tScalar === 0n || tScalar >= SECP_N) {
    throw new Error('Silent payment: invalid t_k.');
  }

  // ── Step 6: P_mn = B_spend + t_k·G; output script is x-only of P. ──
  const spendPoint = Point.fromHex(address.spendPubKey);
  const P = spendPoint.add(Point.BASE.multiply(tScalar));
  // ProjectivePoint provides assertValidity but not is0; round-trip via affine.
  const affine = P.toAffine();
  if (affine.x === 0n && affine.y === 0n) {
    throw new Error('Silent payment: B_spend + t_k·G is point at infinity.');
  }
  const compressed = P.toRawBytes(true);
  return compressed.slice(1, 33); // strip the 0x02/0x03 prefix to get the x-only key
}

