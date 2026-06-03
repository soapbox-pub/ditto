/**
 * PSBT v2 (BIP-370) encoder + parser with BIP-375 silent payment field
 * support — a thin typed layer over `@scure/btc-signer`'s raw PSBT coder.
 *
 * We delegate the wire-format work (magic, framing, varint, per-field
 * typed codecs, on-curve validation of embedded pubkeys) to the library's
 * internal `_RawPSBTV2` coder, which — unlike the more strict `RawPSBTV2`
 * surface used by `Transaction` — leaves `PSBT_OUT_SCRIPT` optional on
 * outputs that only carry `PSBT_OUT_SP_V0_INFO`. That last property is
 * essential for BIP-375: the signer derives the script during signing,
 * so the constructor emits SP outputs without one.
 *
 * The public API exposed here is the higher-level shape Ditto's wallet
 * code prefers — typed `PsbtV2Input` / `PsbtV2Output` records, the SP
 * variant flagged with `type: 'sp'`, and a parsed view that surfaces
 * `unknown` rows by their keytype so callers can poke at BIP-375 fields
 * the library doesn't know about. The convenience wrappers don't change;
 * the byte-level codec underneath is now the library's job.
 *
 * Wire format references:
 *   - BIP-174 §"Specification" (key/value framing, varint, key types).
 *   - BIP-370 §"Specification" (PSBT v2 globals + PREVIOUS_TXID / OUTPUT_INDEX
 *     / OUTPUT_AMOUNT / OUTPUT_SCRIPT keys).
 *   - BIP-375 §"Specification" (PSBT_OUT_SP_V0_INFO + ECDH/DLEQ fields,
 *     OUTPUT_SCRIPT optional when SP_V0_INFO is set; SP_V0_INFO
 *     serialized as `version (1 byte) || scan (33) || spend (33)` per
 *     the "Unique Identification" section).
 */
import { _RawPSBTV2 } from '@scure/btc-signer/psbt.js';

// ---------------------------------------------------------------------------
// BIP-375 + BIP-370 keytype constants (kept private to this module; callers
// that need to inspect unknown rows look them up by `keyType`).
// ---------------------------------------------------------------------------

// Global key types — only the ones we explicitly write/read.
const G_TX_MODIFIABLE = 0x06;
// BIP-375 globals — emitted by the local signer when it finalizes an SP
// PSBT and read on the verifier side. We write/read these via the
// library's `unknown` passthrough.
const G_SP_ECDH_SHARE = 0x07;
const G_SP_DLEQ = 0x08;

// BIP-375 per-input fields (preserved as "unknown" by the library):
//   PSBT_IN_SP_ECDH_SHARE = 0x1d
//   PSBT_IN_SP_DLEQ       = 0x1e

// Per-output BIP-375 keytypes — emitted/read via the library's `unknown`
// passthrough.
const O_SP_V0_INFO = 0x09;
const O_SP_V0_LABEL = 0x0a;

// ---------------------------------------------------------------------------
// Public byte-level helpers
// ---------------------------------------------------------------------------

/**
 * Encode a Bitcoin compact-size integer (1, 3, 5, or 9 bytes depending on
 * magnitude). PSBTs use this for every length prefix.
 *
 * Re-exported because `bitcoin-signers.ts` uses it to encode witness
 * stacks when finalizing locally-signed PSBTs.
 */
export function encodeCompactSize(n: number): Uint8Array {
  if (!Number.isFinite(n) || n < 0) throw new Error(`compactSize: out of range (${n}).`);
  if (n < 0xfd) return new Uint8Array([n]);
  if (n <= 0xffff) {
    const b = new Uint8Array(3);
    b[0] = 0xfd;
    b[1] = n & 0xff;
    b[2] = (n >>> 8) & 0xff;
    return b;
  }
  if (n <= 0xffffffff) {
    const b = new Uint8Array(5);
    b[0] = 0xfe;
    b[1] = n & 0xff;
    b[2] = (n >>> 8) & 0xff;
    b[3] = (n >>> 16) & 0xff;
    b[4] = (n >>> 24) & 0xff;
    return b;
  }
  // We don't construct PSBTs larger than 4 GB.
  throw new Error('compactSize: value too large for safe-integer encoding.');
}

function decodeCompactSize(bytes: Uint8Array, offset: number): { value: number; size: number } {
  if (offset >= bytes.length) throw new Error('compactSize: unexpected end of input.');
  const first = bytes[offset];
  if (first < 0xfd) return { value: first, size: 1 };
  if (first === 0xfd) {
    if (offset + 3 > bytes.length) throw new Error('compactSize: truncated 16-bit value.');
    return { value: bytes[offset + 1] | (bytes[offset + 2] << 8), size: 3 };
  }
  if (first === 0xfe) {
    if (offset + 5 > bytes.length) throw new Error('compactSize: truncated 32-bit value.');
    const v = (bytes[offset + 1]
      | (bytes[offset + 2] << 8)
      | (bytes[offset + 3] << 16)
      | (bytes[offset + 4] << 24)) >>> 0;
    return { value: v, size: 5 };
  }
  throw new Error('compactSize: 64-bit values not supported.');
}

function u32le(n: number): Uint8Array {
  const b = new Uint8Array(4);
  b[0] = n & 0xff;
  b[1] = (n >>> 8) & 0xff;
  b[2] = (n >>> 16) & 0xff;
  b[3] = (n >>> 24) & 0xff;
  return b;
}

function u64le(n: bigint): Uint8Array {
  if (n < 0n) throw new Error('u64le: negative value.');
  const b = new Uint8Array(8);
  let v = n;
  for (let i = 0; i < 8; i++) {
    b[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return b;
}

function concat(...arrs: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const a of arrs) total += a.length;
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrs) {
    out.set(a, off);
    off += a.length;
  }
  return out;
}

function hexToBytes(s: string): Uint8Array {
  if (typeof s !== 'string' || s.length % 2 !== 0) {
    throw new Error('hexToBytes: invalid hex string.');
  }
  const out = new Uint8Array(s.length / 2);
  for (let i = 0; i < out.length; i++) {
    const b = parseInt(s.slice(i * 2, i * 2 + 2), 16);
    if (Number.isNaN(b)) throw new Error('hexToBytes: invalid character.');
    out[i] = b;
  }
  return out;
}

function bytesToHex(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i++) s += b[i].toString(16).padStart(2, '0');
  return s;
}

/**
 * Cheap PSBT-version sniff: walk the globals scope after the magic header
 * looking for a `PSBT_GLOBAL_VERSION` (keytype 0xfb) row with value `2`.
 * If we hit the globals separator (`0x00` key-length) before finding one,
 * the PSBT is v0 (the version field is optional and defaults to 0).
 *
 * We do this ourselves because `@scure/btc-signer`'s v2 decoder rejects v0
 * with a "missing unsignedTx" message that's hard to route on — surfacing
 * the same wording the project's tests and call sites already expect.
 */
function hasPsbtV2Marker(bytes: Uint8Array): boolean {
  let offset = 5; // skip magic
  while (offset < bytes.length) {
    const klen = decodeCompactSize(bytes, offset);
    offset += klen.size;
    if (klen.value === 0) return false; // hit globals separator with no version row
    if (offset + klen.value > bytes.length) return false;
    const keyType = bytes[offset];
    const keyEnd = offset + klen.value;
    offset = keyEnd;
    const vlen = decodeCompactSize(bytes, offset);
    offset += vlen.size;
    if (offset + vlen.value > bytes.length) return false;
    if (keyType === 0xfb && vlen.value === 4) {
      const v = bytes[offset]
        | (bytes[offset + 1] << 8)
        | (bytes[offset + 2] << 16)
        | (bytes[offset + 3] << 24);
      if (v === 2) return true;
    }
    offset += vlen.value;
  }
  return false;
}

// ---------------------------------------------------------------------------
// PSBT v2 input / output shapes (sender side)
// ---------------------------------------------------------------------------

/** A previous-output reference for a PSBT v2 input. */
export interface PsbtV2Input {
  /** Display-order (big-endian) txid hex of the previous output being spent. */
  txid: string;
  /** Index of the output within the previous transaction. */
  vout: number;
  /** nSequence (defaults to 0xfffffffd, BIP-125 RBF-enabled). */
  sequence?: number;
  /**
   * Witness UTXO for SegWit-style inputs: the previous output's
   * `scriptPubKey` and amount. Required for all inputs we construct in
   * Ditto's wallet (P2TR + key-path only).
   */
  witnessUtxo: {
    /** Amount in satoshis. */
    amount: bigint;
    /** Previous output's `scriptPubKey` (e.g. `OP_1 push32 <xonly>`). */
    script: Uint8Array;
  };
  /** Optional 32-byte x-only Taproot internal key. */
  tapInternalKey?: Uint8Array;
  /**
   * Optional pre-finalized witness stack — emitted as
   * `PSBT_IN_FINAL_SCRIPTWITNESS`. The local nsec signer uses this to
   * round-trip a fully-signed PSBT v2 through {@link extractTxFromSignedPsbtV2}
   * without going via `@scure/btc-signer`'s `Transaction` model.
   */
  finalScriptWitness?: Uint8Array[];
}

/** A regular (non-SP) output: known script + amount. */
export interface PsbtV2OutputRegular {
  type: 'script';
  /** Amount in satoshis. */
  amount: bigint;
  /** scriptPubKey bytes (e.g. P2TR `OP_1 push32 <xonly>`). */
  script: Uint8Array;
}

/** A BIP-375 silent payment output: signer fills in the script. */
export interface PsbtV2OutputSilentPayment {
  type: 'sp';
  /** Amount in satoshis. */
  amount: bigint;
  /** 33-byte compressed scan key from the recipient's `sp1…` address. */
  scanPubKey: Uint8Array;
  /** 33-byte compressed spend key (`B_m`) from the recipient's address. */
  spendPubKey: Uint8Array;
  /**
   * Optional change label, encoded into PSBT_OUT_SP_V0_LABEL as a 32-bit
   * little-endian uint. Only used when the silent payment output is the
   * sender's own change (m = 0 by convention) — we don't construct
   * labelled outgoing payments today.
   */
  label?: number;
}

/** Either output flavour the encoder accepts. */
export type PsbtV2Output = PsbtV2OutputRegular | PsbtV2OutputSilentPayment;

/** Parameters for {@link encodePsbtV2}. */
export interface PsbtV2EncodeOptions {
  /** Transaction version (defaults to 2; BIP-68 / BIP-112-friendly). */
  txVersion?: number;
  /** Fallback `nLockTime` (defaults to 0). */
  fallbackLocktime?: number;
  /**
   * `PSBT_GLOBAL_TX_MODIFIABLE` bitfield. BIP-375 requires this to be 0
   * once the signer has filled in every `PSBT_OUT_SCRIPT`. The constructor
   * (us) starts at 0b011 (inputs and outputs both modifiable); the signer
   * clears it when it freezes the SP scripts. We default to omitting the
   * field, which is equivalent to "no constraints announced" — signers
   * that need to bump it back on do so during signing.
   */
  txModifiable?: number;
  /**
   * Optional BIP-375 global ECDH shares + DLEQ proofs, keyed by scan key.
   *
   * Per BIP-375 §"Computing the ECDH Shares and DLEQ Proofs", when a single
   * signer owns the private keys for every eligible input it should emit
   * one global share per recipient scan key (rather than per-input shares).
   * Each entry produces a paired `PSBT_GLOBAL_SP_ECDH_SHARE` (keytype 0x07,
   * keydata = 33-byte scan key, value = 33-byte share `C = a·B_scan`) and
   * `PSBT_GLOBAL_SP_DLEQ` (keytype 0x08, keydata = scan key, value = 64-byte
   * BIP-374 proof) row.
   *
   * The local nsec signer fills this in when finalizing an SP PSBT so an
   * external BIP-375 verifier can re-derive the output scripts without
   * trusting the signer.
   */
  silentPaymentGlobals?: {
    scanPubKey: Uint8Array;
    ecdhShare: Uint8Array;
    dleqProof: Uint8Array;
  }[];
  inputs: PsbtV2Input[];
  outputs: PsbtV2Output[];
}

// ---------------------------------------------------------------------------
// PSBT v2 encoder
// ---------------------------------------------------------------------------

/**
 * Library shape used by `_RawPSBTV2.encode`. We construct globals/inputs/
 * outputs as `Record<string, unknown>` and pass the whole thing through
 * the library's encoder; the precise (very deeply nested) typing isn't
 * worth threading through statically. The library tolerates any subset
 * of named fields plus an `unknown` array of `[{type, key}, value]`
 * tuples.
 */
type LibUnknown = [{ type: number; key: Uint8Array }, Uint8Array][];

/**
 * Serialize a PSBT v2 with BIP-375 silent payment outputs.
 *
 * Outputs of `type: 'sp'` are emitted with `PSBT_OUT_SP_V0_INFO` (and
 * optionally `PSBT_OUT_SP_V0_LABEL`) instead of a `PSBT_OUT_SCRIPT` — per
 * BIP-375 the signer derives and writes the script during signing.
 *
 * Returns the hex-encoded PSBT.
 */
export function encodePsbtV2(opts: PsbtV2EncodeOptions): string {
  const txVersion = opts.txVersion ?? 2;
  const fallbackLocktime = opts.fallbackLocktime ?? 0;
  const inputs = opts.inputs;
  const outputs = opts.outputs;

  // Globals -- the library writes PSBT_GLOBAL_VERSION on encode (set to 2
  // by the table schema), so we don't pass it explicitly.
  const globalUnknown: LibUnknown = [];
  if (opts.txModifiable !== undefined) {
    globalUnknown.push([
      { type: G_TX_MODIFIABLE, key: new Uint8Array(0) },
      new Uint8Array([opts.txModifiable & 0xff]),
    ]);
  }
  if (opts.silentPaymentGlobals) {
    for (const sp of opts.silentPaymentGlobals) {
      if (sp.scanPubKey.length !== 33) {
        throw new Error('PSBT v2 global SP: scanPubKey must be 33 bytes.');
      }
      if (sp.ecdhShare.length !== 33) {
        throw new Error('PSBT v2 global SP: ecdhShare must be 33 bytes.');
      }
      if (sp.dleqProof.length !== 64) {
        throw new Error('PSBT v2 global SP: dleqProof must be 64 bytes.');
      }
      // BIP-375 keys these records by the recipient's 33-byte scan key.
      globalUnknown.push([
        { type: G_SP_ECDH_SHARE, key: new Uint8Array(sp.scanPubKey) },
        new Uint8Array(sp.ecdhShare),
      ]);
      globalUnknown.push([
        { type: G_SP_DLEQ, key: new Uint8Array(sp.scanPubKey) },
        new Uint8Array(sp.dleqProof),
      ]);
    }
  }

  const globalShape: Record<string, unknown> = {
    txVersion,
    fallbackLocktime,
    inputCount: inputs.length,
    outputCount: outputs.length,
    version: 2,
  };
  if (globalUnknown.length > 0) globalShape.unknown = globalUnknown;

  const inputShapes = inputs.map((inp) => {
    if (inp.tapInternalKey !== undefined && inp.tapInternalKey.length !== 32) {
      throw new Error('PSBT v2 input: tapInternalKey must be 32 bytes.');
    }
    const txidBytes = hexToBytes(inp.txid);
    if (txidBytes.length !== 32) {
      throw new Error('PSBT v2 input: txid must be 32 bytes.');
    }
    const obj: Record<string, unknown> = {
      // Library expects display-order bytes for txid (it reverses to wire
      // little-endian internally on encode); same applies on decode.
      txid: txidBytes,
      index: inp.vout,
      sequence: inp.sequence ?? 0xfffffffd,
      witnessUtxo: { amount: inp.witnessUtxo.amount, script: inp.witnessUtxo.script },
    };
    if (inp.tapInternalKey) obj.tapInternalKey = inp.tapInternalKey;
    // `finalScriptWitness` is the BIP-174 finalized-input witness stack —
    // present on PSBTs that have already been signed by the local nsec
    // path. The library serializes the stack into the
    // `PSBT_IN_FINAL_SCRIPTWITNESS` row automatically.
    if (inp.finalScriptWitness && inp.finalScriptWitness.length > 0) {
      obj.finalScriptWitness = inp.finalScriptWitness;
    }
    return obj;
  });

  const outputShapes = outputs.map((out) => {
    if (out.type === 'script') {
      return { amount: out.amount, script: out.script };
    }
    // BIP-375 silent payment output.
    if (out.scanPubKey.length !== 33) {
      throw new Error('PSBT v2 output: scanPubKey must be 33 bytes.');
    }
    if (out.spendPubKey.length !== 33) {
      throw new Error('PSBT v2 output: spendPubKey must be 33 bytes.');
    }
    // PSBT_OUT_SP_V0_INFO value = 1-byte version (0) || 33 scan || 33 spend.
    // Per BIP-375 §"Unique Identification". The trailing version byte
    // makes the field stable across silent-payment versions.
    const spInfo = concat(new Uint8Array([0x00]), out.scanPubKey, out.spendPubKey);
    const unknown: LibUnknown = [[{ type: O_SP_V0_INFO, key: new Uint8Array(0) }, spInfo]];
    if (out.label !== undefined) {
      unknown.push([
        { type: O_SP_V0_LABEL, key: new Uint8Array(0) },
        u32le(out.label),
      ]);
    }
    return {
      amount: out.amount,
      // No `script` field — BIP-375 makes it optional when SP_V0_INFO is set.
      unknown,
    };
  });

  // `_RawPSBTV2.encode` accepts a `Record<string, unknown>` that the library
  // narrows internally; the (very deeply nested) static typing isn't worth
  // threading through. The library tolerates any subset of named fields
  // plus an `unknown` array.
  type LibInput = Parameters<typeof _RawPSBTV2.encode>[0];
  const libPsbt = {
    magic: undefined,
    global: globalShape,
    inputs: inputShapes,
    outputs: outputShapes,
  } as unknown as LibInput;

  let bytes: Uint8Array;
  try {
    bytes = _RawPSBTV2.encode(libPsbt);
  } catch (err) {
    throw new Error(
      `PSBT v2 encode failed: ${err instanceof Error ? err.message : String(err)}`,
      { cause: err },
    );
  }
  return bytesToHex(bytes);
}

// ---------------------------------------------------------------------------
// Parsed PSBT v2 (consumer-facing view)
// ---------------------------------------------------------------------------

/** An unknown PSBT key/value row, with the keytype byte separated out. */
export interface PsbtKV {
  /** First byte of the key (the BIP-174 keytype). */
  keyType: number;
  /** Bytes of the key after the keytype byte (often empty). */
  keyData: Uint8Array;
  value: Uint8Array;
}

/** Decoded PSBT v2 input scope. */
export interface ParsedPsbtV2Input {
  /** Display-order txid hex (the form everywhere in mempool.space / RPC). */
  txid: string;
  vout: number;
  sequence: number;
  finalScriptSig?: Uint8Array;
  /** Witness stack — populated for SegWit inputs after the signer finalizes. */
  finalScriptWitness?: Uint8Array[];
  /**
   * BIP-371 `PSBT_IN_TAP_KEY_SIG` — Schnorr signature for a Taproot
   * key-path spend. Set by signers that follow the BIP-174 split between
   * "signed" and "finalized": the signature is recorded here, and a
   * Finalizer wraps it into `finalScriptWitness = [tapKeySig]` before the
   * raw transaction can be extracted. `extractTxFromSignedPsbtV2` handles
   * that conversion automatically for the wallet's Taproot-only input
   * shape.
   */
  tapKeySig?: Uint8Array;
  witnessUtxo?: { amount: bigint; script: Uint8Array };
  /** Unrecognised key/value pairs preserved for completeness. */
  unknown: PsbtKV[];
}

/** Decoded PSBT v2 output scope. */
export interface ParsedPsbtV2Output {
  amount: bigint;
  /**
   * scriptPubKey. Present after the signer finalizes BIP-375 SP outputs
   * (or unconditionally for regular outputs); absent if the signer
   * returned the PSBT with `PSBT_OUT_SP_V0_INFO` still unfilled.
   */
  script?: Uint8Array;
  /** Unrecognised key/value pairs preserved for completeness. */
  unknown: PsbtKV[];
}

/** Result of {@link parsePsbtV2}. */
export interface ParsedPsbtV2 {
  txVersion: number;
  fallbackLocktime: number;
  inputs: ParsedPsbtV2Input[];
  outputs: ParsedPsbtV2Output[];
}

// ---------------------------------------------------------------------------
// PSBT v2 parser
// ---------------------------------------------------------------------------

/**
 * Bridge the library's `unknown` representation (an array of
 * `[{ type, key }, value]` tuples) to our flat `PsbtKV` shape.
 */
function unknownToKVs(unknown: unknown): PsbtKV[] {
  if (!unknown || !Array.isArray(unknown)) return [];
  return (unknown as LibUnknown).map(([k, v]) => ({
    keyType: k.type,
    keyData: new Uint8Array(k.key),
    value: new Uint8Array(v),
  }));
}

/**
 * Decode a PSBT v2 (with possible BIP-375 fields) from hex.
 *
 * The parser tolerates unrecognised key types so the signer can attach
 * implementation-specific rows without breaking the consumer. Required
 * structural fields (`PSBT_GLOBAL_VERSION = 2`, `PSBT_GLOBAL_TX_VERSION`,
 * `PSBT_GLOBAL_INPUT_COUNT`, `PSBT_GLOBAL_OUTPUT_COUNT`, per-input
 * `PSBT_IN_PREVIOUS_TXID` / `PSBT_IN_OUTPUT_INDEX`, per-output
 * `PSBT_OUT_AMOUNT`) are validated. PSBT v0/v1 inputs are rejected.
 */
export function parsePsbtV2(psbtHex: string): ParsedPsbtV2 {
  const bytes = hexToBytes(psbtHex);
  // Cheap shape checks before handing off to the library, so we surface
  // the project's familiar error wording for the obvious failure modes
  // (truncated input, wrong magic, PSBT v0).
  if (bytes.length < 5) {
    throw new Error('PSBT parse: truncated header (magic).');
  }
  if (
    bytes[0] !== 0x70 || bytes[1] !== 0x73 || bytes[2] !== 0x62 || bytes[3] !== 0x74 || bytes[4] !== 0xff
  ) {
    throw new Error('PSBT parse: bad magic.');
  }

  // The library would happily accept a PSBT v0 here and surface a confusing
  // "missing unsignedTx" error from deep inside its decoder. Sniff the
  // version byte ourselves so we can throw something the call sites can
  // route on. PSBT_GLOBAL_VERSION (0xfb) is optional; its absence means v0.
  if (!hasPsbtV2Marker(bytes)) {
    throw new Error('PSBT parse: only PSBT v2 is supported in this code path.');
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let raw: any;
  try {
    raw = _RawPSBTV2.decode(bytes);
  } catch (err) {
    throw new Error(
      `PSBT parse: ${err instanceof Error ? err.message : String(err)}`,
      { cause: err },
    );
  }

  const global = raw.global as Record<string, unknown> | undefined;
  const version = (global?.version as number | undefined) ?? 0;
  if (version !== 2) {
    throw new Error('PSBT parse: only PSBT v2 is supported in this code path.');
  }
  // BIP-370: PSBT_GLOBAL_UNSIGNED_TX must NOT appear in PSBTv2.
  if (global?.unsignedTx !== undefined) {
    throw new Error('PSBT parse: PSBT_GLOBAL_UNSIGNED_TX must not appear in PSBT v2.');
  }
  const txVersion = global?.txVersion as number | undefined;
  if (txVersion === undefined) {
    throw new Error('PSBT parse: missing PSBT_GLOBAL_TX_VERSION.');
  }
  const fallbackLocktime = (global?.fallbackLocktime as number | undefined) ?? 0;
  const inputCount = global?.inputCount as number | undefined;
  const outputCount = global?.outputCount as number | undefined;
  if (inputCount === undefined) {
    throw new Error('PSBT parse: missing PSBT_GLOBAL_INPUT_COUNT.');
  }
  if (outputCount === undefined) {
    throw new Error('PSBT parse: missing PSBT_GLOBAL_OUTPUT_COUNT.');
  }

  const rawInputs = (raw.inputs ?? []) as Record<string, unknown>[];
  const rawOutputs = (raw.outputs ?? []) as Record<string, unknown>[];
  if (rawInputs.length !== inputCount) {
    throw new Error(
      `PSBT parse: input count mismatch (header says ${inputCount}, got ${rawInputs.length}).`,
    );
  }
  if (rawOutputs.length !== outputCount) {
    throw new Error(
      `PSBT parse: output count mismatch (header says ${outputCount}, got ${rawOutputs.length}).`,
    );
  }

  const inputs: ParsedPsbtV2Input[] = rawInputs.map((inp, i) => {
    const txidBytes = inp.txid as Uint8Array | undefined;
    const vout = inp.index as number | undefined;
    if (!txidBytes || txidBytes.length !== 32) {
      throw new Error(`PSBT parse: input ${i} missing PSBT_IN_PREVIOUS_TXID.`);
    }
    if (vout === undefined) {
      throw new Error(`PSBT parse: input ${i} missing PSBT_IN_OUTPUT_INDEX.`);
    }
    const sequence = (inp.sequence as number | undefined) ?? 0xfffffffd;
    const witnessUtxoLib = inp.witnessUtxo as { amount: bigint; script: Uint8Array } | undefined;
    const witnessUtxo = witnessUtxoLib
      ? { amount: witnessUtxoLib.amount, script: new Uint8Array(witnessUtxoLib.script) }
      : undefined;
    const finalScriptSig = inp.finalScriptSig as Uint8Array | undefined;
    const finalScriptWitness = inp.finalScriptWitness as Uint8Array[] | undefined;
    const tapKeySig = inp.tapKeySig as Uint8Array | undefined;
    return {
      // Library returns display-order bytes (it already reversed the wire
      // little-endian during decode).
      txid: bytesToHex(txidBytes),
      vout,
      sequence,
      finalScriptSig: finalScriptSig ? new Uint8Array(finalScriptSig) : undefined,
      finalScriptWitness: finalScriptWitness
        ? finalScriptWitness.map((w) => new Uint8Array(w))
        : undefined,
      tapKeySig: tapKeySig ? new Uint8Array(tapKeySig) : undefined,
      witnessUtxo,
      unknown: unknownToKVs(inp.unknown),
    };
  });

  const outputs: ParsedPsbtV2Output[] = rawOutputs.map((out, i) => {
    const amount = out.amount as bigint | undefined;
    if (amount === undefined) {
      throw new Error(`PSBT parse: output ${i} missing PSBT_OUT_AMOUNT.`);
    }
    const script = out.script as Uint8Array | undefined;
    return {
      amount,
      script: script ? new Uint8Array(script) : undefined,
      unknown: unknownToKVs(out.unknown),
    };
  });

  return { txVersion, fallbackLocktime, inputs, outputs };
}

// ---------------------------------------------------------------------------
// Raw transaction extractor
// ---------------------------------------------------------------------------

/**
 * Extract a finalized raw Bitcoin transaction from a fully-signed PSBT v2.
 *
 * Requires:
 *   - every input to have either `finalScriptSig`, `finalScriptWitness`,
 *     `tapKeySig`, or some combination — Taproot key-path inputs that only
 *     carry `tapKeySig` are auto-finalized here by wrapping it into the
 *     single-item witness stack BIP-341 §"Validation" demands;
 *   - every output to have `PSBT_OUT_SCRIPT` set (BIP-375 silent payment
 *     outputs must have been derived and finalized by the signer).
 *
 * Returns the hex-encoded transaction ready to broadcast.
 */
export function extractTxFromSignedPsbtV2(psbtHex: string): string {
  const psbt = parsePsbtV2(psbtHex);

  // BIP-174 separates "signed" from "finalized": a Taproot key-path
  // signer may legitimately return a PSBT with `tapKeySig` set but no
  // `finalScriptWitness`. The Finalizer role wraps `tapKeySig` into a
  // single-item witness stack. We do that here so callers don't have to
  // care about which role their signer fulfils.
  for (let i = 0; i < psbt.inputs.length; i++) {
    const inp = psbt.inputs[i];
    if (
      !inp.finalScriptSig &&
      !inp.finalScriptWitness &&
      inp.tapKeySig
    ) {
      inp.finalScriptWitness = [inp.tapKeySig];
    }
  }

  for (let i = 0; i < psbt.inputs.length; i++) {
    const inp = psbt.inputs[i];
    if (!inp.finalScriptSig && !inp.finalScriptWitness) {
      throw new Error(`PSBT v2 extract: input ${i} is not finalized (no scriptSig or witness).`);
    }
  }
  for (let i = 0; i < psbt.outputs.length; i++) {
    if (!psbt.outputs[i].script) {
      throw new Error(
        `PSBT v2 extract: output ${i} has no scriptPubKey — the signer must derive silent payment outputs before extraction.`,
      );
    }
  }

  const hasAnyWitness = psbt.inputs.some(
    (i) => i.finalScriptWitness && i.finalScriptWitness.length > 0,
  );

  const parts: Uint8Array[] = [];
  parts.push(u32le(psbt.txVersion));

  if (hasAnyWitness) {
    // SegWit marker + flag
    parts.push(new Uint8Array([0x00, 0x01]));
  }

  parts.push(encodeCompactSize(psbt.inputs.length));
  for (const inp of psbt.inputs) {
    // Display-order hex → wire little-endian.
    const txidDisplay = hexToBytes(inp.txid);
    const txidWire = new Uint8Array(txidDisplay).reverse();
    parts.push(txidWire);
    parts.push(u32le(inp.vout));
    const ss = inp.finalScriptSig ?? new Uint8Array(0);
    parts.push(encodeCompactSize(ss.length));
    parts.push(ss);
    parts.push(u32le(inp.sequence));
  }

  parts.push(encodeCompactSize(psbt.outputs.length));
  for (const out of psbt.outputs) {
    parts.push(u64le(out.amount));
    const script = out.script!;
    parts.push(encodeCompactSize(script.length));
    parts.push(script);
  }

  if (hasAnyWitness) {
    for (const inp of psbt.inputs) {
      const w = inp.finalScriptWitness ?? [];
      parts.push(encodeCompactSize(w.length));
      for (const item of w) {
        parts.push(encodeCompactSize(item.length));
        parts.push(item);
      }
    }
  }

  parts.push(u32le(psbt.fallbackLocktime));

  return bytesToHex(concat(...parts));
}

// ---------------------------------------------------------------------------
// Re-exported helpers used elsewhere (e.g. tests / `bitcoin-signers.ts`).
// ---------------------------------------------------------------------------

export const _internal = { decodeCompactSize, u32le, u64le };
