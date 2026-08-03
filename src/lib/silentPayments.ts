/**
 * BIP352 Silent Payments — sender side.
 *
 * Decodes silent payment addresses (`sp1…` mainnet, `tsp1…` testnets) and
 * derives the one-shot Taproot output(s) the sender must include in the
 * transaction.
 *
 * What we implement:
 *
 *   - The bech32m variant used by BIP352 (no length cap, witness version
 *     up to 31, "sp" / "tsp" HRPs).
 *   - Sender output derivation per the spec:
 *       a            = sum of input private keys (Taproot keys negated if
 *                      their pubkey has an odd Y)
 *       A            = a·G
 *       input_hash   = hashBIP0352/Inputs(outpoint_L || serP(A))
 *       ecdh         = input_hash·a·B_scan
 *       t_k          = hashBIP0352/SharedSecret(serP(ecdh) || ser32(k))
 *       P_mn         = B_spend + t_k·G
 *     P_mn is encoded x-only as a BIP341 taproot output.
 *
 * What we deliberately do NOT implement:
 *
 *   - The receiver side (scanning).
 *   - Labels (`m != 0`). The labelled flow only matters on the receiver,
 *     and the address payload already commits to the labelled `B_m`.
 *
 * The implementation is verified against the canonical BIP352
 * `send_and_receive_test_vectors.json` — see
 * `src/lib/silentPayments.test.ts` and
 * `src/test/fixtures/bip352_sender_vectors.json`.
 *
 * Backed by `@scure/btc-signer` (Address / p2tr / OutScript) and
 * `@noble/curves/secp256k1` (Point math) — no `bitcoinjs-lib` /
 * `@bitcoinerlab/secp256k1` dependency.
 */
import * as btc from '@scure/btc-signer';
import { hash160, taprootTweakPrivKey } from '@scure/btc-signer/utils.js';
import { secp256k1 } from '@noble/curves/secp256k1';
import { sha256 } from '@noble/hashes/sha256';
import {
  BECH32M_CONST,
  CHARSET,
  hrpExpand,
  isValidCompressedPoint,
  polymod,
  type SilentPaymentAddress,
  type SilentPaymentNetwork,
} from './silentPaymentsCore';

// Address decoding/validation lives in the dependency-light
// `./silentPaymentsCore` (no `@scure/btc-signer`), so initial-load callers
// can validate addresses cheaply. Re-exported here so wallet code can keep
// importing everything from one place.
export {
  isSilentPaymentAddress,
  decodeSilentPaymentAddress,
  validateSilentPaymentAddress,
  type SilentPaymentAddress,
  type SilentPaymentNetwork,
} from './silentPaymentsCore';

/**
 * secp256k1 Point class (used for all EC arithmetic).
 *
 * `@noble/curves` v1 exposes the projective-point constructor as
 * `secp256k1.ProjectivePoint`; v2 moved it to `schnorr.Point`. We use the
 * v1 export to match the rest of the ditto codebase.
 */
const Point = secp256k1.ProjectivePoint;

// ---------------------------------------------------------------------------
// BIP352 tagged hashes (BIP-340 style)
// ---------------------------------------------------------------------------
//
// tagged(tag, msg) = SHA256( SHA256(tag) || SHA256(tag) || msg )
// We compute these manually because BIP-352 introduces custom tags that
// aren't in any predefined table.

function taggedHash(tag: string, msg: Uint8Array): Uint8Array {
  // `new TextEncoder().encode()` returns a Uint8Array, but in jsdom the
  // returned instance is from a different realm than noble's internal
  // `u8a` check — so we copy into a fresh `new Uint8Array(…)` to ensure
  // the prototype matches.
  const tagBytes = new Uint8Array(new TextEncoder().encode(tag));
  const tagHash = sha256(tagBytes);
  const data = new Uint8Array(tagHash.length * 2 + msg.length);
  data.set(tagHash, 0);
  data.set(tagHash, tagHash.length);
  data.set(msg, tagHash.length * 2);
  return sha256(data);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function u32be(n: number): Uint8Array {
  if (!Number.isInteger(n) || n < 0 || n > 0xffffffff) {
    throw new Error(`ser32: out of range (${n}).`);
  }
  const b = new Uint8Array(4);
  b[0] = (n >>> 24) & 0xff;
  b[1] = (n >>> 16) & 0xff;
  b[2] = (n >>> 8) & 0xff;
  b[3] = n & 0xff;
  return b;
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

function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
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

function bytesToHex(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i++) {
    s += b[i].toString(16).padStart(2, '0');
  }
  return s;
}

/** Bigint <-> 32-byte big-endian. */
function bytesToScalar(b: Uint8Array): bigint {
  let v = 0n;
  for (const byte of b) v = (v << 8n) | BigInt(byte);
  return v;
}

const SECP_N =
  0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;

function scalarToBytes(s: bigint): Uint8Array {
  if (s <= 0n || s >= SECP_N) {
    throw new Error('Scalar out of range.');
  }
  const out = new Uint8Array(32);
  let v = s;
  for (let i = 31; i >= 0; i--) {
    out[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return out;
}

/** Derive the 33-byte compressed pubkey for a 32-byte scalar. */
function pubKeyFromScalar(privateKey: Uint8Array): Uint8Array {
  const k = bytesToScalar(privateKey);
  if (k === 0n || k >= SECP_N) {
    throw new Error('Silent payment: invalid input private key.');
  }
  return Point.BASE.multiply(k).toRawBytes(true);
}

/** Negate a 32-byte private key mod N. */
function privateNegate(privateKey: Uint8Array): Uint8Array {
  const k = bytesToScalar(privateKey);
  if (k === 0n || k >= SECP_N) {
    throw new Error('Silent payment: invalid input private key.');
  }
  return scalarToBytes(SECP_N - k);
}

// ---------------------------------------------------------------------------
// Eligible input pubkey extraction (for the BIP352 sender)
// ---------------------------------------------------------------------------

/**
 * Eligible-input pubkey returned by {@link extractEligibleInputPubKey}.
 *
 * `isTaproot` is critical because Taproot input private keys must be
 * negated if their corresponding x-only pubkey has an odd Y coordinate
 * before the sender sums them.
 */
export interface EligibleInputPubKey {
  /** 33-byte compressed pubkey. For taproot we set the parity to even. */
  pubkey: Uint8Array;
  isTaproot: boolean;
}

const NUMS_H_XONLY = hexToBytes(
  '50929b74c1a04954b78b4b6035e97a5e078a5a0f28ec96d547bfee9ace803ac0',
);

/**
 * Parse a transaction input and decide whether it contributes to the silent
 * payment ECDH sum. The returned pubkey (if any) is the one the receiver
 * will recover when scanning, so the sender must match it exactly.
 *
 * Supported per BIP352:
 *   - P2TR (key-path and script-path; skips H-as-internal-key script-path)
 *   - P2WPKH
 *   - P2SH-P2WPKH
 *   - P2PKH (parses last push of scriptSig even on non-standard forms)
 *
 * Returns `null` for any other input type.
 *
 * @param scriptPubKeyHex hex of the prevout scriptPubKey
 * @param scriptSigHex    hex of the input's scriptSig (may be empty)
 * @param witness         array of witness items, each as a Uint8Array
 *                        (may be empty / undefined)
 */
export function extractEligibleInputPubKey(
  scriptPubKeyHex: string,
  scriptSigHex: string,
  witness: Uint8Array[] | undefined,
): EligibleInputPubKey | null {
  const spk = hexToBytes(scriptPubKeyHex);
  const ss = scriptSigHex ? hexToBytes(scriptSigHex) : new Uint8Array(0);
  const wit = witness ?? [];

  // P2TR: OP_1 (0x51) + push32 (0x20) + 32-byte xonly key
  if (spk.length === 34 && spk[0] === 0x51 && spk[1] === 0x20) {
    const xonly = spk.subarray(2, 34);

    // Script path with NUMS-H internal key → skip per BIP352.
    if (wit.length >= 2) {
      const controlBlock = wit[wit.length - 1];
      // The annex (if present) is the last witness item starting with 0x50.
      // Strip it before reading the control block.
      let controlIdx = wit.length - 1;
      if (controlBlock.length > 0 && controlBlock[0] === 0x50 && wit.length >= 3) {
        controlIdx = wit.length - 2;
      }
      const ctrl = wit[controlIdx];
      // Control block: 1 byte (leaf version + parity) || 32-byte internal pk || merkle path
      if (ctrl.length >= 33 && (ctrl.length - 1) % 32 === 0) {
        const internal = ctrl.subarray(1, 33);
        if (equalBytes(internal, NUMS_H_XONLY)) {
          return null;
        }
      }
    }

    return {
      pubkey: xOnlyToEvenCompressed(xonly),
      isTaproot: true,
    };
  }

  // P2WPKH: OP_0 (0x00) + push20 (0x14) + 20-byte key hash.
  // scriptSig empty, witness = [signature, 33-byte compressed pubkey].
  if (spk.length === 22 && spk[0] === 0x00 && spk[1] === 0x14) {
    if (ss.length !== 0) return null;
    if (wit.length < 2) return null;
    const pk = wit[wit.length - 1];
    if (pk.length === 33 && (pk[0] === 0x02 || pk[0] === 0x03)) {
      return { pubkey: new Uint8Array(pk), isTaproot: false };
    }
    return null;
  }

  // P2SH-P2WPKH:
  //   scriptPubKey: HASH160 push20 <20-byte-hash> EQUAL  (23 bytes: 0xA9 0x14 ... 0x87)
  //   scriptSig: push22 <0x00 0x14 <20-byte-hash>>       (23 bytes: 0x16 0x00 0x14 ...)
  //   witness: [signature, 33-byte compressed pubkey]
  if (spk.length === 23 && spk[0] === 0xa9 && spk[1] === 0x14 && spk[22] === 0x87) {
    if (ss.length !== 23) return null;
    if (ss[0] !== 0x16 || ss[1] !== 0x00 || ss[2] !== 0x14) return null;
    if (wit.length < 2) return null;
    const pk = wit[wit.length - 1];
    if (pk.length === 33 && (pk[0] === 0x02 || pk[0] === 0x03)) {
      return { pubkey: new Uint8Array(pk), isTaproot: false };
    }
    return null;
  }

  // P2PKH: OP_DUP OP_HASH160 push20 <hash> OP_EQUALVERIFY OP_CHECKSIG
  // 25 bytes: 0x76 0xa9 0x14 ... 0x88 0xac
  if (
    spk.length === 25 &&
    spk[0] === 0x76 &&
    spk[1] === 0xa9 &&
    spk[2] === 0x14 &&
    spk[23] === 0x88 &&
    spk[24] === 0xac
  ) {
    // Per BIP352, we MUST tolerate non-standard / malleated scriptSigs (e.g.
    // `<dummy> OP_DROP <sig> <pk>`, or an `OP_IF/OP_ELSE/OP_ENDIF` branch
    // that contains a pubkey that isn't being checked). We can't rely on
    // "last push" because a malleated scriptSig may contain another 33-byte
    // push that just happens not to be the spending pubkey.
    //
    // The reference implementation walks the scriptSig byte-by-byte with a
    // 33-byte sliding window and accepts the first window whose HASH160
    // matches the prevout's key hash. We do the same — scanning from the
    // back, which matches the standard layout the fastest.
    const targetHash = spk.subarray(3, 23);
    for (let i = ss.length; i >= 33; i--) {
      const candidate = ss.subarray(i - 33, i);
      if (candidate.length !== 33) continue;
      if (candidate[0] !== 0x02 && candidate[0] !== 0x03) continue;
      const h = hash160(candidate);
      if (h.length === 20 && equalBytes(h, targetHash)) {
        // Validate that it's a valid point on the curve.
        if (isValidCompressedPoint(candidate)) {
          return { pubkey: new Uint8Array(candidate), isTaproot: false };
        }
      }
    }
    return null;
  }

  return null;
}

/** x-only (32 bytes) → 33-byte compressed with prefix 0x02 (even Y). */
function xOnlyToEvenCompressed(xonly: Uint8Array): Uint8Array {
  if (xonly.length !== 32) throw new Error('xonly key must be 32 bytes.');
  const out = new Uint8Array(33);
  out[0] = 0x02;
  out.set(xonly, 1);
  return out;
}

// ---------------------------------------------------------------------------
// Outpoint serialization (little-endian txid || little-endian vout)
// ---------------------------------------------------------------------------

/**
 * Serialize an outpoint exactly as it appears in a Bitcoin transaction:
 *   - 32-byte txid in internal (little-endian) byte order; tools display the
 *     reverse,
 *   - 4-byte vout in little-endian.
 *
 * `txid` is accepted as either the display hex (32-byte big-endian; the form
 * everywhere in Esplora/mempool.space/RPC clients show) or the raw little-endian
 * bytes — pass `txidIsLittleEndian: true` for the latter.
 */
function serializeOutpoint(
  txidHex: string,
  vout: number,
  txidIsLittleEndian = false,
): Uint8Array {
  if (!/^[0-9a-fA-F]{64}$/.test(txidHex)) {
    throw new Error('outpoint: txid must be 32-byte hex.');
  }
  const txid = hexToBytes(txidHex);
  if (!txidIsLittleEndian) {
    // Reverse to little-endian internal byte order.
    txid.reverse();
  }
  const voutBuf = new Uint8Array(4);
  voutBuf[0] = vout & 0xff;
  voutBuf[1] = (vout >>> 8) & 0xff;
  voutBuf[2] = (vout >>> 16) & 0xff;
  voutBuf[3] = (vout >>> 24) & 0xff;
  return concatBytes(txid, voutBuf);
}

// ---------------------------------------------------------------------------
// Sender output derivation
// ---------------------------------------------------------------------------

/**
 * A single sender input that contributes to BIP352 ECDH.
 *
 * `privateKey` is the input's signing private key. For Taproot inputs this is
 * the BIP341 *tweaked* key (the same scalar used to produce the Schnorr
 * signature on the input), NOT the untweaked Nostr-style internal key.
 *
 * `isTaproot` flips the negate-if-odd-Y rule on (BIP352 §"Creating outputs").
 */
export interface SilentPaymentInput {
  txid: string;
  vout: number;
  privateKey: Uint8Array;
  /** Optional override; if absent, derived from `privateKey`. */
  pubkey?: Uint8Array;
  isTaproot: boolean;
}

/** A single resolved silent payment recipient + amount. */
export interface SilentPaymentRecipient {
  /** The decoded silent payment address. */
  address: SilentPaymentAddress;
  /** Display string of the original address (for diagnostics). */
  raw?: string;
}

/**
 * One concrete sender output (the receiver's per-`k` taproot output) ready to
 * be added to a PSBT.
 */
export interface SilentPaymentOutput {
  /** 32-byte x-only taproot key — the value of the output's scriptPubKey. */
  xOnlyPubKey: Uint8Array;
  /** Convenience: the matching mainnet/testnet P2TR address. */
  address: string;
  /** The recipient this output was generated for. */
  recipient: SilentPaymentRecipient;
}

/**
 * Compute the BIP352 sender outputs for a fixed set of inputs and recipients.
 *
 * The inputs MUST be the final set that will be signed and broadcast: the
 * recipient's output depends on the input set (via `outpoint_L` and `A`).
 * Adding, removing, or replacing an input invalidates the derived outputs.
 *
 * `eligibleInputs` are the inputs that contribute to the BIP352 ECDH sum
 * (P2TR, P2WPKH, P2SH-P2WPKH, P2PKH with a compressed pubkey; NUMS-H
 * taproot script paths are excluded by the caller). `allOutpoints` is the
 * outpoint of *every* input in the transaction — including ineligible ones
 * — because BIP352 picks the lexicographically smallest outpoint across the
 * whole transaction for `input_hash`. When `allOutpoints` is omitted, the
 * outpoints of `eligibleInputs` are used (matches the common case where
 * every input is eligible — which is what the in-extension wallet always
 * produces).
 *
 * Throws if:
 *   - no eligible inputs are given,
 *   - the summed private key is zero,
 *   - `input_hash` or any `t_k` would be an invalid scalar,
 *   - a recipient group exceeds `K_max = 2323` (per BIP352).
 *
 * Recipients are matched by scan key: multiple silent payment addresses
 * sharing the same scan key are grouped, and each receives `k = 0, 1, …` in
 * input order.
 */
export function deriveSilentPaymentOutputs(
  eligibleInputs: SilentPaymentInput[],
  recipients: SilentPaymentRecipient[],
  options: {
    /**
     * Outpoints of every input in the transaction. BIP352 picks the
     * lexicographically smallest one across ALL inputs (not just eligible
     * ones) for `input_hash`. Defaults to the outpoints of `eligibleInputs`.
     */
    allOutpoints?: { txid: string; vout: number }[];
    network?: 'mainnet' | 'testnet';
  } = {},
): SilentPaymentOutput[] {
  const network = options.network ?? 'mainnet';
  const inputs = eligibleInputs;
  if (inputs.length === 0) {
    throw new Error('Silent payment: at least one eligible input is required.');
  }
  if (recipients.length === 0) return [];

  // ── Step 0: K_max check — done FIRST so we fail before any crypto work ─
  const K_MAX = 2323;
  // Group recipients by hex(scanPubKey) so the same payee with multiple
  // amounts (or multiple labelled addresses) shares one ECDH derivation
  // and a single `k` counter.
  const groups = new Map<string, SilentPaymentRecipient[]>();
  for (const r of recipients) {
    const key = bytesToHex(r.address.scanPubKey);
    const arr = groups.get(key);
    if (arr) arr.push(r);
    else groups.set(key, [r]);
  }
  for (const arr of groups.values()) {
    if (arr.length > K_MAX) {
      throw new Error(`Silent payment: recipient group exceeds K_max=${K_MAX}.`);
    }
  }

  // ── Step 1: compute a = Σ a_i, negating Taproot keys with odd-Y pubkeys ──
  let aSum = 0n;
  for (const input of inputs) {
    if (input.privateKey.length !== 32) {
      throw new Error('Silent payment: input private key must be 32 bytes.');
    }
    let pk = input.privateKey;
    if (input.isTaproot) {
      // Derive the pubkey and check parity.
      const pubFull = pubKeyFromScalar(pk);
      if (pubFull[0] === 0x03) {
        // Odd-Y → negate the private key.
        pk = privateNegate(pk);
      }
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

  // A = a·G (compressed)
  const aPub = Point.BASE.multiply(aSum).toRawBytes(true);

  // ── Step 2: outpoint_L = lex-smallest serialized outpoint ─────────────
  const outpointsForHash = options.allOutpoints ?? inputs.map((i) => ({ txid: i.txid, vout: i.vout }));
  if (outpointsForHash.length === 0) {
    throw new Error('Silent payment: no outpoints provided.');
  }
  let smallest: Uint8Array | null = null;
  for (const op of outpointsForHash) {
    const ser = serializeOutpoint(op.txid, op.vout);
    if (smallest === null || compareBytes(ser, smallest) < 0) {
      smallest = ser;
    }
  }
  if (!smallest) throw new Error('Silent payment: no outpoints.');

  // ── Step 3: input_hash = hashBIP0352/Inputs(outpoint_L || A) ──────────
  const inputHash = taggedHash(
    'BIP0352/Inputs',
    concatBytes(smallest, aPub),
  );
  const inputHashScalar = bytesToScalar(inputHash);
  if (inputHashScalar === 0n || inputHashScalar >= SECP_N) {
    throw new Error('Silent payment: invalid input_hash.');
  }

  // ── Step 4: derive outputs per group ─────────────────────────────────
  const out: SilentPaymentOutput[] = [];
  for (const group of groups.values()) {
    // ecdh = input_hash · a · B_scan
    // Compute as Point arithmetic: ((input_hash * a) mod n) · B_scan.
    const scanPoint = Point.fromHex(group[0].address.scanPubKey);
    const combinedScalar = (inputHashScalar * aSum) % SECP_N;
    if (combinedScalar === 0n) {
      throw new Error('Silent payment: input_hash · a is zero.');
    }
    const ecdh = scanPoint.multiply(combinedScalar).toRawBytes(true);

    let k = 0;
    for (const recipient of group) {
      const tK = taggedHash(
        'BIP0352/SharedSecret',
        concatBytes(ecdh, u32be(k)),
      );
      const tScalar = bytesToScalar(tK);
      if (tScalar === 0n || tScalar >= SECP_N) {
        throw new Error('Silent payment: invalid t_k.');
      }

      // P_mn = B_spend + t_k·G
      const spendPoint = Point.fromHex(recipient.address.spendPubKey);
      const P = spendPoint.add(Point.BASE.multiply(tScalar));
      // noble v1 has no `is0()`; an x=y=0 affine reading means the point
      // at infinity. `toRawBytes` would throw on that, so the round-trip
      // here doubles as a validity gate.
      const Paff = P.toAffine();
      if (Paff.x === 0n && Paff.y === 0n) {
        throw new Error('Silent payment: B_spend + t_k·G is point at infinity.');
      }
      const Pbytes = P.toRawBytes(true);

      // BIP341 taproot output is the x-only of P.
      const xonly = new Uint8Array(Pbytes.subarray(1, 33));
      const addr = encodeP2TR(xonly, network);
      out.push({ xOnlyPubKey: xonly, address: addr, recipient });
      k++;
    }
  }

  return out;
}

/** Encode an x-only key as a P2TR address using @scure/btc-signer. */
function encodeP2TR(xonly: Uint8Array, network: 'mainnet' | 'testnet'): string {
  const net = network === 'mainnet' ? btc.NETWORK : btc.TEST_NETWORK;
  // `p2tr(internalKey)` here is given the **output** key directly; passing
  // it without a script tree and reading `.address` yields the bech32m
  // encoding of `OP_1 push32 <xonly>` for the chosen network.
  const pay = btc.p2tr(xonly, undefined, net);
  if (!pay.address) {
    throw new Error('Silent payment: failed to encode P2TR address.');
  }
  return pay.address;
}

/**
 * Encode an x-only key as a P2TR scriptPubKey (`OP_1 push32 <xonly>`).
 * The 34-byte byte string that should be written into a Bitcoin transaction
 * output's scriptPubKey field.
 */
export function p2trScriptPubKey(xonly: Uint8Array): Uint8Array {
  if (xonly.length !== 32) {
    throw new Error('p2trScriptPubKey: xonly key must be 32 bytes.');
  }
  const out = new Uint8Array(34);
  out[0] = 0x51; // OP_1
  out[1] = 0x20; // push 32 bytes
  out.set(xonly, 2);
  return out;
}

// ---------------------------------------------------------------------------
// bech32m encoding (BIP-352 silent payment address writer)
// ---------------------------------------------------------------------------

/** 8-bit → 5-bit conversion (used when encoding a payload into a bech32m address). */
function convertBits8to5(data: Uint8Array): number[] {
  let acc = 0;
  let bits = 0;
  const out: number[] = [];
  for (const v of data) {
    if (v < 0 || v > 255) throw new Error('convertBits8to5: byte out of range.');
    acc = (acc << 8) | v;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out.push((acc >>> bits) & 0x1f);
    }
  }
  if (bits > 0) {
    out.push((acc << (5 - bits)) & 0x1f);
  }
  return out;
}

function bech32mChecksum(hrp: string, data: number[]): number[] {
  const values = hrpExpand(hrp).concat(data).concat([0, 0, 0, 0, 0, 0]);
  const mod = polymod(values) ^ BECH32M_CONST;
  const out: number[] = [];
  for (let i = 0; i < 6; i++) {
    out.push((mod >>> (5 * (5 - i))) & 0x1f);
  }
  return out;
}

/**
 * Encode a silent payment address back from its components.
 *
 * Useful for the prompt UI: a BIP-375 PSBT carries the scan/spend pubkey
 * pair in `PSBT_OUT_SP_V0_INFO`, and we want to display the corresponding
 * `sp1…` / `tsp1…` string to the user before they approve the signature.
 */
export function encodeSilentPaymentAddress(params: {
  network: SilentPaymentNetwork;
  /** Silent payment version (0 for `sp1q…`). */
  version: number;
  scanPubKey: Uint8Array;
  spendPubKey: Uint8Array;
}): string {
  const { network, version, scanPubKey, spendPubKey } = params;
  if (version < 0 || version > 30) {
    throw new Error('Silent payment encode: invalid version.');
  }
  if (scanPubKey.length !== 33 || spendPubKey.length !== 33) {
    throw new Error('Silent payment encode: pubkeys must be 33 bytes each.');
  }
  const hrp = network === 'mainnet' ? 'sp' : 'tsp';
  const payload = new Uint8Array(66);
  payload.set(scanPubKey, 0);
  payload.set(spendPubKey, 33);
  const data5 = [version, ...convertBits8to5(payload)];
  const checksum = bech32mChecksum(hrp, data5);
  const combined = data5.concat(checksum);
  let out = hrp + '1';
  for (const v of combined) {
    if (v < 0 || v >= CHARSET.length) {
      throw new Error('Silent payment encode: invalid 5-bit value.');
    }
    out += CHARSET[v];
  }
  return out;
}

// ---------------------------------------------------------------------------
// BIP-375 / BIP-352 ECDH share computation (sender side)
// ---------------------------------------------------------------------------

/** Output of {@link aggregateSenderPrivateKey}. */
export interface AggregateSenderKey {
  /** Aggregate scalar `a = Σ a_i` after BIP-352 parity-flip on Taproot inputs (32 bytes). */
  aggregateScalar: Uint8Array;
  /** `A = a·G` (33-byte compressed). */
  aggregatePubKey: Uint8Array;
  /** Smallest serialized outpoint across the full input set. */
  outpointL: Uint8Array;
  /** `input_hash = hashBIP0352/Inputs(outpoint_L || serP(A))` (32 bytes). */
  inputHash: Uint8Array;
}

/**
 * Compute the aggregate private scalar `a`, derived public key `A`, the
 * lexicographically smallest outpoint, and `input_hash` for a set of
 * BIP-352-eligible inputs.
 *
 * `eligibleInputs` are inputs that contribute to the ECDH sum (P2TR /
 * P2WPKH / P2SH-P2WPKH / P2PKH). Taproot inputs are expected to provide the
 * BIP-341 *tweaked* private key (the same scalar that produces the Schnorr
 * signature); a BIP-340 odd-Y negation is applied here per the BIP-352
 * sender algorithm.
 *
 * `allOutpoints` is the outpoint of *every* input in the transaction —
 * including ineligible ones — because BIP-352 picks the lex-smallest
 * across the whole transaction for `input_hash`. Defaults to the outpoints
 * of the eligible inputs.
 */
export function aggregateSenderPrivateKey(
  eligibleInputs: SilentPaymentInput[],
  allOutpoints?: { txid: string; vout: number }[],
): AggregateSenderKey {
  if (eligibleInputs.length === 0) {
    throw new Error('Silent payment: at least one eligible input is required.');
  }

  let aSum = 0n;
  for (const input of eligibleInputs) {
    if (input.privateKey.length !== 32) {
      throw new Error('Silent payment: input private key must be 32 bytes.');
    }
    let pk = input.privateKey;
    if (input.isTaproot) {
      const pubFull = pubKeyFromScalar(pk);
      if (pubFull[0] === 0x03) {
        pk = privateNegate(pk);
      }
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
  const aBytes = scalarToBytes(aSum);
  const aPub = Point.BASE.multiply(aSum).toRawBytes(true);

  const outpointsForHash =
    allOutpoints ?? eligibleInputs.map((i) => ({ txid: i.txid, vout: i.vout }));
  if (outpointsForHash.length === 0) {
    throw new Error('Silent payment: no outpoints provided.');
  }
  let smallest: Uint8Array | null = null;
  for (const op of outpointsForHash) {
    const ser = serializeOutpoint(op.txid, op.vout);
    if (smallest === null || compareBytes(ser, smallest) < 0) {
      smallest = ser;
    }
  }
  if (!smallest) throw new Error('Silent payment: no outpoints.');

  const inputHash = taggedHash(
    'BIP0352/Inputs',
    concatBytes(smallest, aPub),
  );
  const inputHashScalar = bytesToScalar(inputHash);
  if (inputHashScalar === 0n || inputHashScalar >= SECP_N) {
    throw new Error('Silent payment: invalid input_hash.');
  }

  return {
    aggregateScalar: aBytes,
    aggregatePubKey: aPub,
    outpointL: smallest,
    inputHash,
  };
}

/**
 * BIP-375 §"Computing the ECDH Shares": for a single recipient scan key,
 * compute the global ECDH share `C = a · B_scan`.
 *
 * NOTE: BIP-375 defines the share as `a · B_scan`, NOT the BIP-352 sender
 * formula `input_hash · a · B_scan`. The verifier multiplies by `input_hash`
 * locally after verifying the DLEQ proof (which proves the simpler
 * relation `C = a · B_scan` for the same `a` that produces `A`).
 */
export function computeBip375EcdhShare(
  aggregateScalar: Uint8Array,
  scanPubKey: Uint8Array,
): Uint8Array {
  const k = bytesToScalar(aggregateScalar);
  if (k === 0n || k >= SECP_N) {
    throw new Error('Silent payment: aggregate scalar out of range.');
  }
  const scanPoint = Point.fromHex(scanPubKey);
  return scanPoint.multiply(k).toRawBytes(true);
}

/**
 * Derive a single silent-payment P2TR output from a pre-computed BIP-375 ECDH
 * share, the recipient's spend pubkey, and a `k` counter.
 *
 * `C` is the per-scan-key ECDH share `a · B_scan`. We multiply it by
 * `input_hash` here to obtain the BIP-352 `ecdh_shared_secret`, then derive
 * `P_k = B_spend + hash(serP(ecdh) || ser32(k))·G` and return its x-only.
 */
export function deriveSPOutputScriptFromShare(params: {
  ecdhShare: Uint8Array;
  inputHash: Uint8Array;
  spendPubKey: Uint8Array;
  k: number;
}): Uint8Array {
  const { ecdhShare, inputHash, spendPubKey, k } = params;
  const sharePoint = Point.fromHex(ecdhShare);
  const inputHashScalar = bytesToScalar(inputHash);
  if (inputHashScalar === 0n || inputHashScalar >= SECP_N) {
    throw new Error('Silent payment: invalid input_hash.');
  }
  const ecdh = sharePoint.multiply(inputHashScalar).toRawBytes(true);
  const tK = taggedHash(
    'BIP0352/SharedSecret',
    concatBytes(ecdh, u32be(k)),
  );
  const tScalar = bytesToScalar(tK);
  if (tScalar === 0n || tScalar >= SECP_N) {
    throw new Error('Silent payment: invalid t_k.');
  }
  const spendPoint = Point.fromHex(spendPubKey);
  const P = spendPoint.add(Point.BASE.multiply(tScalar));
  const Paff = P.toAffine();
  if (Paff.x === 0n && Paff.y === 0n) {
    throw new Error('Silent payment: B_spend + t_k·G is point at infinity.');
  }
  return new Uint8Array(P.toRawBytes(true).subarray(1, 33));
}

// ---------------------------------------------------------------------------
// Convenience for the in-extension wallet
// ---------------------------------------------------------------------------

/**
 * Compute the BIP341-tweaked private key for a Nostr nsec acting as a Taproot
 * internal key with no script tree (the wallet's only spending mode). This is
 * the scalar the user must contribute to BIP352's `a` sum, and the one that
 * actually signs the P2TR inputs.
 *
 * Returns 32 bytes. Throws if the input is invalid.
 *
 * `@scure/btc-signer/utils`' `taprootTweakPrivKey` already implements the
 * BIP-341 parity-flip + TapTweak (key-path only when `merkleRoot` is
 * `undefined`), so we just delegate.
 */
export function tweakNsecForTaproot(privateKeyHex: string): Uint8Array {
  if (!/^[0-9a-fA-F]{64}$/.test(privateKeyHex)) {
    throw new Error('Private key must be 32-byte hex.');
  }
  const d = hexToBytes(privateKeyHex);
  const k = bytesToScalar(d);
  if (k === 0n || k >= SECP_N) {
    throw new Error('Invalid private key.');
  }
  return new Uint8Array(taprootTweakPrivKey(d));
}
