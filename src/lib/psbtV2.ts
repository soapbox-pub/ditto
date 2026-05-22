/**
 * Minimal PSBT v2 (BIP-370) encoder + parser with BIP-375 silent payment
 * field support.
 *
 * `@scure/btc-signer` is the rest of Ditto's PSBT engine, but its
 * `Transaction` class enforces a `script` on every output. BIP-375 makes
 * `PSBT_OUT_SCRIPT` optional on outputs that carry `PSBT_OUT_SP_V0_INFO`
 * (the signer derives the script during signing), so we need to emit those
 * outputs ourselves. The encoder produces a byte-for-byte compliant PSBT v2
 * that any BIP-375-aware signer (NIP-07 or NIP-46 in the assumption of this
 * file's caller) can ingest, and the parser reads back the signer's
 * response — specifically the input-level witnesses, scriptSigs, and now-
 * derived output scripts — so we can extract a finalized raw transaction
 * for broadcast.
 *
 * The parser is intentionally lenient: it tolerates unknown key types and
 * unknown sub-fields, since signers may attach implementation-specific
 * proprietary rows we have no opinion on.
 *
 * Wire format references:
 *   - BIP-174 §"Specification" (key/value framing, varint, key types).
 *   - BIP-370 §"Specification" (PSBT v2 globals + PREVIOUS_TXID / OUTPUT_INDEX
 *     / OUTPUT_AMOUNT / OUTPUT_SCRIPT keys).
 *   - BIP-375 §"Specification" (PSBT_OUT_SP_V0_INFO + ECDH/DLEQ fields,
 *     OUTPUT_SCRIPT optional when SP_V0_INFO is set).
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** 5-byte PSBT magic: `0x70 0x73 0x62 0x74 0xff` ("psbt" + 0xff). */
const PSBT_MAGIC = new Uint8Array([0x70, 0x73, 0x62, 0x74, 0xff]);

/** Key/value separator: terminates each scope (globals / per-input / per-output). */
const PSBT_SEPARATOR = 0x00;

// Global key types — BIP-174 + BIP-370 + BIP-375
const G_TX_VERSION = 0x02;
const G_FALLBACK_LOCKTIME = 0x03;
const G_INPUT_COUNT = 0x04;
const G_OUTPUT_COUNT = 0x05;
const G_TX_MODIFIABLE = 0x06;
const G_VERSION = 0xfb;
// BIP-375 globals — emitted by some signers, ignored on the constructor side.
// Documented here for reference; the parser walks past them as "unknown".
//   PSBT_GLOBAL_SP_ECDH_SHARE = 0x07
//   PSBT_GLOBAL_SP_DLEQ       = 0x08

// Input key types — BIP-174 + BIP-370 + BIP-375
const I_WITNESS_UTXO = 0x01;
const I_FINAL_SCRIPTSIG = 0x07;
const I_FINAL_SCRIPTWITNESS = 0x08;
const I_PREVIOUS_TXID = 0x0e;
const I_OUTPUT_INDEX = 0x0f;
const I_SEQUENCE = 0x10;
const I_TAP_INTERNAL_KEY = 0x17;
// BIP-375 input fields — see note above for globals.
//   PSBT_IN_SP_ECDH_SHARE = 0x1d
//   PSBT_IN_SP_DLEQ       = 0x1e

// Output key types — BIP-174 + BIP-370 + BIP-375
const O_AMOUNT = 0x03;
const O_SCRIPT = 0x04;
const O_SP_V0_INFO = 0x09;     // BIP-375
const O_SP_V0_LABEL = 0x0a;    // BIP-375

// ---------------------------------------------------------------------------
// Low-level wire helpers
// ---------------------------------------------------------------------------

/**
 * Encode a Bitcoin compact-size integer (1, 3, 5, or 9 bytes depending on
 * magnitude). PSBTs use this for every length prefix.
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

/**
 * Decode a compact-size integer starting at `bytes[offset]`. Returns the
 * value and the byte length consumed.
 */
function decodeCompactSize(bytes: Uint8Array, offset: number): { value: number; size: number } {
  if (offset >= bytes.length) throw new Error('compactSize: unexpected end of input.');
  const first = bytes[offset];
  if (first < 0xfd) return { value: first, size: 1 };
  if (first === 0xfd) {
    if (offset + 3 > bytes.length) throw new Error('compactSize: truncated 16-bit value.');
    return {
      value: bytes[offset + 1] | (bytes[offset + 2] << 8),
      size: 3,
    };
  }
  if (first === 0xfe) {
    if (offset + 5 > bytes.length) throw new Error('compactSize: truncated 32-bit value.');
    const v = (bytes[offset + 1]
      | (bytes[offset + 2] << 8)
      | (bytes[offset + 3] << 16)
      | (bytes[offset + 4] << 24)) >>> 0;
    return { value: v, size: 5 };
  }
  // 0xff → 8-byte; we don't need to support these sizes here.
  throw new Error('compactSize: 64-bit values not supported.');
}

/** Little-endian unsigned 16-bit. */
function u16le(n: number): Uint8Array {
  const b = new Uint8Array(2);
  b[0] = n & 0xff;
  b[1] = (n >>> 8) & 0xff;
  return b;
}

/** Little-endian unsigned 32-bit. */
function u32le(n: number): Uint8Array {
  const b = new Uint8Array(4);
  b[0] = n & 0xff;
  b[1] = (n >>> 8) & 0xff;
  b[2] = (n >>> 16) & 0xff;
  b[3] = (n >>> 24) & 0xff;
  return b;
}

/** Little-endian unsigned 64-bit (bigint). */
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

/** Encode a PSBT key/value pair. `key` is the raw bytes after the keytype. */
function kv(keyType: number, key: Uint8Array, value: Uint8Array): Uint8Array {
  const keyBytes = concat(new Uint8Array([keyType]), key);
  return concat(
    encodeCompactSize(keyBytes.length),
    keyBytes,
    encodeCompactSize(value.length),
    value,
  );
}

/** Hex → bytes. Throws on odd-length or non-hex. */
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
 * Reverse a 32-byte txid between display order (big-endian, the form users
 * paste from explorers / RPC) and internal byte order (little-endian, the
 * form that goes into raw transactions and PSBT v2 PREVIOUS_TXID fields).
 */
function reverseBytes(b: Uint8Array): Uint8Array {
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b[b.length - 1 - i];
  return out;
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
  inputs: PsbtV2Input[];
  outputs: PsbtV2Output[];
}

// ---------------------------------------------------------------------------
// PSBT v2 encoder
// ---------------------------------------------------------------------------

/**
 * Serialize a PSBT v2 with BIP-375 silent payment outputs.
 *
 * Outputs of `type: 'sp'` are emitted with `PSBT_OUT_SP_V0_INFO` instead of
 * a `PSBT_OUT_SCRIPT` — per BIP-375 the signer derives and writes the
 * script during signing.
 *
 * Returns the hex-encoded PSBT.
 */
export function encodePsbtV2(opts: PsbtV2EncodeOptions): string {
  const txVersion = opts.txVersion ?? 2;
  const fallbackLocktime = opts.fallbackLocktime ?? 0;
  const inputs = opts.inputs;
  const outputs = opts.outputs;

  const parts: Uint8Array[] = [];
  parts.push(PSBT_MAGIC);

  // ── Globals ─────────────────────────────────────────────────
  parts.push(kv(G_VERSION, new Uint8Array(0), u32le(2)));
  parts.push(kv(G_TX_VERSION, new Uint8Array(0), u32le(txVersion)));
  parts.push(kv(G_FALLBACK_LOCKTIME, new Uint8Array(0), u32le(fallbackLocktime)));
  parts.push(kv(G_INPUT_COUNT, new Uint8Array(0), encodeCompactSize(inputs.length)));
  parts.push(kv(G_OUTPUT_COUNT, new Uint8Array(0), encodeCompactSize(outputs.length)));
  if (opts.txModifiable !== undefined) {
    parts.push(kv(G_TX_MODIFIABLE, new Uint8Array(0), new Uint8Array([opts.txModifiable & 0xff])));
  }
  parts.push(new Uint8Array([PSBT_SEPARATOR]));

  // ── Per-input maps ──────────────────────────────────────────
  for (const inp of inputs) {
    // PREVIOUS_TXID is serialized in standard (little-endian / internal)
    // byte order — opposite of the display-order hex everywhere else.
    const txidLE = reverseBytes(hexToBytes(inp.txid));
    if (txidLE.length !== 32) throw new Error('PSBT v2 input: txid must be 32 bytes.');
    parts.push(kv(I_PREVIOUS_TXID, new Uint8Array(0), txidLE));
    parts.push(kv(I_OUTPUT_INDEX, new Uint8Array(0), u32le(inp.vout)));
    parts.push(kv(I_SEQUENCE, new Uint8Array(0), u32le(inp.sequence ?? 0xfffffffd)));

    // WITNESS_UTXO: 8-byte LE amount || compact-size scriptlen || scriptPubKey
    const wu = concat(
      u64le(inp.witnessUtxo.amount),
      encodeCompactSize(inp.witnessUtxo.script.length),
      inp.witnessUtxo.script,
    );
    parts.push(kv(I_WITNESS_UTXO, new Uint8Array(0), wu));

    if (inp.tapInternalKey) {
      if (inp.tapInternalKey.length !== 32) {
        throw new Error('PSBT v2 input: tapInternalKey must be 32 bytes.');
      }
      parts.push(kv(I_TAP_INTERNAL_KEY, new Uint8Array(0), inp.tapInternalKey));
    }

    parts.push(new Uint8Array([PSBT_SEPARATOR]));
  }

  // ── Per-output maps ─────────────────────────────────────────
  for (const out of outputs) {
    parts.push(kv(O_AMOUNT, new Uint8Array(0), u64le(out.amount)));
    if (out.type === 'script') {
      parts.push(kv(O_SCRIPT, new Uint8Array(0), out.script));
    } else {
      // BIP-375: PSBT_OUT_SP_V0_INFO = version (1 byte = 0) || scan (33) || spend (33)
      if (out.scanPubKey.length !== 33) {
        throw new Error('PSBT v2 SP output: scan key must be 33 bytes.');
      }
      if (out.spendPubKey.length !== 33) {
        throw new Error('PSBT v2 SP output: spend key must be 33 bytes.');
      }
      const spInfo = concat(new Uint8Array([0x00]), out.scanPubKey, out.spendPubKey);
      parts.push(kv(O_SP_V0_INFO, new Uint8Array(0), spInfo));
      if (out.label !== undefined) {
        parts.push(kv(O_SP_V0_LABEL, new Uint8Array(0), u32le(out.label)));
      }
    }
    parts.push(new Uint8Array([PSBT_SEPARATOR]));
  }

  return bytesToHex(concat(...parts));
}

// ---------------------------------------------------------------------------
// PSBT v2 parser (lenient)
// ---------------------------------------------------------------------------

/** A single key/value row inside a PSBT scope. */
interface PsbtKV {
  /** First byte of the key — the BIP-174 keytype number. */
  keyType: number;
  /** Bytes of the key after the keytype byte (often empty). */
  keyData: Uint8Array;
  value: Uint8Array;
}

/** Decoded PSBT v2 input scope. */
export interface ParsedPsbtV2Input {
  /** Display-order txid hex (we reverse the wire bytes back to display order). */
  txid: string;
  vout: number;
  sequence: number;
  finalScriptSig?: Uint8Array;
  /** Witness stack — populated for SegWit inputs after the signer finalizes. */
  finalScriptWitness?: Uint8Array[];
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

/**
 * Parse a single key/value row at `offset`. Returns the row plus the new
 * offset. When the first byte is the separator (0x00) the caller should
 * close the current scope; we surface that by returning `null`.
 */
function readKV(bytes: Uint8Array, offset: number): { kv: PsbtKV | null; next: number } {
  const keyLen = decodeCompactSize(bytes, offset);
  offset += keyLen.size;
  if (keyLen.value === 0) {
    // Separator
    return { kv: null, next: offset };
  }
  if (offset + keyLen.value > bytes.length) {
    throw new Error('PSBT v2 parse: key extends past end of input.');
  }
  const keyType = bytes[offset];
  const keyData = bytes.slice(offset + 1, offset + keyLen.value);
  offset += keyLen.value;
  const valLen = decodeCompactSize(bytes, offset);
  offset += valLen.size;
  if (offset + valLen.value > bytes.length) {
    throw new Error('PSBT v2 parse: value extends past end of input.');
  }
  const value = bytes.slice(offset, offset + valLen.value);
  offset += valLen.value;
  return { kv: { keyType, keyData, value }, next: offset };
}

/**
 * Decode a PSBT v2 (with possible BIP-375 fields) from hex.
 *
 * The parser tolerates unrecognised key types so the signer can attach
 * implementation-specific rows without breaking the consumer. Required
 * structural fields (`PSBT_GLOBAL_INPUT_COUNT`, `PSBT_GLOBAL_OUTPUT_COUNT`,
 * per-input `PSBT_IN_PREVIOUS_TXID` / `PSBT_IN_OUTPUT_INDEX`, per-output
 * `PSBT_OUT_AMOUNT`) are validated. PSBT v0/v1 inputs are rejected.
 */
export function parsePsbtV2(psbtHex: string): ParsedPsbtV2 {
  const bytes = hexToBytes(psbtHex);
  if (bytes.length < PSBT_MAGIC.length + 1) {
    throw new Error('PSBT parse: truncated header.');
  }
  for (let i = 0; i < PSBT_MAGIC.length; i++) {
    if (bytes[i] !== PSBT_MAGIC[i]) throw new Error('PSBT parse: bad magic.');
  }
  let offset = PSBT_MAGIC.length;

  // ── Globals ─────────────────────────────────────────────────
  let version: number | undefined;
  let txVersion: number | undefined;
  let fallbackLocktime = 0;
  let inputCount: number | undefined;
  let outputCount: number | undefined;
  for (;;) {
    const { kv: row, next } = readKV(bytes, offset);
    offset = next;
    if (!row) break;
    switch (row.keyType) {
      case G_VERSION:
        if (row.value.length !== 4) throw new Error('PSBT parse: bad PSBT_GLOBAL_VERSION length.');
        version = row.value[0] | (row.value[1] << 8) | (row.value[2] << 16) | (row.value[3] << 24);
        break;
      case G_TX_VERSION:
        if (row.value.length !== 4) throw new Error('PSBT parse: bad PSBT_GLOBAL_TX_VERSION length.');
        txVersion = (row.value[0] | (row.value[1] << 8) | (row.value[2] << 16) | (row.value[3] << 24)) >>> 0;
        break;
      case G_FALLBACK_LOCKTIME:
        if (row.value.length !== 4) throw new Error('PSBT parse: bad fallback locktime length.');
        fallbackLocktime = (row.value[0] | (row.value[1] << 8) | (row.value[2] << 16) | (row.value[3] << 24)) >>> 0;
        break;
      case G_INPUT_COUNT: {
        const c = decodeCompactSize(row.value, 0);
        inputCount = c.value;
        break;
      }
      case G_OUTPUT_COUNT: {
        const c = decodeCompactSize(row.value, 0);
        outputCount = c.value;
        break;
      }
      // Other globals (xpub, tx_modifiable, sp ecdh share, sp dleq, proprietary,
      // unsignedTx for v0) we ignore — they don't affect transaction extraction.
    }
  }
  if (version !== 2) {
    throw new Error('PSBT parse: only PSBT v2 is supported in this code path.');
  }
  if (txVersion === undefined) throw new Error('PSBT parse: missing PSBT_GLOBAL_TX_VERSION.');
  if (inputCount === undefined) throw new Error('PSBT parse: missing PSBT_GLOBAL_INPUT_COUNT.');
  if (outputCount === undefined) throw new Error('PSBT parse: missing PSBT_GLOBAL_OUTPUT_COUNT.');

  // ── Inputs ──────────────────────────────────────────────────
  const inputs: ParsedPsbtV2Input[] = [];
  for (let i = 0; i < inputCount; i++) {
    let txidLE: Uint8Array | undefined;
    let vout: number | undefined;
    let sequence = 0xfffffffd;
    let finalScriptSig: Uint8Array | undefined;
    let finalScriptWitness: Uint8Array[] | undefined;
    let witnessUtxo: { amount: bigint; script: Uint8Array } | undefined;
    const unknown: PsbtKV[] = [];
    for (;;) {
      const { kv: row, next } = readKV(bytes, offset);
      offset = next;
      if (!row) break;
      switch (row.keyType) {
        case I_PREVIOUS_TXID:
          if (row.value.length !== 32) throw new Error('PSBT parse: bad PSBT_IN_PREVIOUS_TXID length.');
          txidLE = row.value;
          break;
        case I_OUTPUT_INDEX:
          if (row.value.length !== 4) throw new Error('PSBT parse: bad PSBT_IN_OUTPUT_INDEX length.');
          vout = (row.value[0] | (row.value[1] << 8) | (row.value[2] << 16) | (row.value[3] << 24)) >>> 0;
          break;
        case I_SEQUENCE:
          if (row.value.length !== 4) throw new Error('PSBT parse: bad PSBT_IN_SEQUENCE length.');
          sequence = (row.value[0] | (row.value[1] << 8) | (row.value[2] << 16) | (row.value[3] << 24)) >>> 0;
          break;
        case I_FINAL_SCRIPTSIG:
          finalScriptSig = row.value;
          break;
        case I_FINAL_SCRIPTWITNESS:
          finalScriptWitness = decodeWitness(row.value);
          break;
        case I_WITNESS_UTXO: {
          if (row.value.length < 9) throw new Error('PSBT parse: bad PSBT_IN_WITNESS_UTXO length.');
          let v = 0n;
          for (let j = 7; j >= 0; j--) v = (v << 8n) | BigInt(row.value[j]);
          const slen = decodeCompactSize(row.value, 8);
          const script = row.value.slice(8 + slen.size, 8 + slen.size + slen.value);
          witnessUtxo = { amount: v, script };
          break;
        }
        default:
          unknown.push(row);
      }
    }
    if (!txidLE) throw new Error(`PSBT parse: input ${i} missing PSBT_IN_PREVIOUS_TXID.`);
    if (vout === undefined) throw new Error(`PSBT parse: input ${i} missing PSBT_IN_OUTPUT_INDEX.`);
    inputs.push({
      txid: bytesToHex(reverseBytes(txidLE)),
      vout,
      sequence,
      finalScriptSig,
      finalScriptWitness,
      witnessUtxo,
      unknown,
    });
  }

  // ── Outputs ─────────────────────────────────────────────────
  const outputs: ParsedPsbtV2Output[] = [];
  for (let i = 0; i < outputCount; i++) {
    let amount: bigint | undefined;
    let script: Uint8Array | undefined;
    const unknown: PsbtKV[] = [];
    for (;;) {
      const { kv: row, next } = readKV(bytes, offset);
      offset = next;
      if (!row) break;
      switch (row.keyType) {
        case O_AMOUNT: {
          if (row.value.length !== 8) throw new Error('PSBT parse: bad PSBT_OUT_AMOUNT length.');
          let v = 0n;
          for (let j = 7; j >= 0; j--) v = (v << 8n) | BigInt(row.value[j]);
          amount = v;
          break;
        }
        case O_SCRIPT:
          script = row.value;
          break;
        default:
          unknown.push(row);
      }
    }
    if (amount === undefined) throw new Error(`PSBT parse: output ${i} missing PSBT_OUT_AMOUNT.`);
    outputs.push({ amount, script, unknown });
  }

  return { txVersion, fallbackLocktime, inputs, outputs };
}

/**
 * Decode a PSBT-serialized witness (compact-size item count followed by
 * `<compact-size length> <bytes>` per item).
 */
function decodeWitness(bytes: Uint8Array): Uint8Array[] {
  let offset = 0;
  const count = decodeCompactSize(bytes, offset);
  offset += count.size;
  const items: Uint8Array[] = [];
  for (let i = 0; i < count.value; i++) {
    const len = decodeCompactSize(bytes, offset);
    offset += len.size;
    if (offset + len.value > bytes.length) {
      throw new Error('PSBT parse: witness item extends past end of input.');
    }
    items.push(bytes.slice(offset, offset + len.value));
    offset += len.value;
  }
  return items;
}

// ---------------------------------------------------------------------------
// Raw transaction extractor
// ---------------------------------------------------------------------------

/**
 * Extract a finalized raw Bitcoin transaction from a fully-signed PSBT v2.
 *
 * Requires:
 *   - every input to have either `finalScriptSig`, `finalScriptWitness`, or
 *     both (legacy inputs use scriptSig; SegWit + Taproot use witness);
 *   - every output to have `PSBT_OUT_SCRIPT` set (BIP-375 silent payment
 *     outputs must have been derived and finalized by the signer).
 *
 * Returns the hex-encoded transaction ready to broadcast.
 */
export function extractTxFromSignedPsbtV2(psbtHex: string): string {
  const psbt = parsePsbtV2(psbtHex);

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

  const hasAnyWitness = psbt.inputs.some((i) => i.finalScriptWitness && i.finalScriptWitness.length > 0);

  const parts: Uint8Array[] = [];
  parts.push(u32le(psbt.txVersion));

  if (hasAnyWitness) {
    // SegWit marker + flag
    parts.push(new Uint8Array([0x00, 0x01]));
  }

  // Inputs
  parts.push(encodeCompactSize(psbt.inputs.length));
  for (const inp of psbt.inputs) {
    parts.push(reverseBytes(hexToBytes(inp.txid))); // wire is little-endian
    parts.push(u32le(inp.vout));
    const ss = inp.finalScriptSig ?? new Uint8Array(0);
    parts.push(encodeCompactSize(ss.length));
    parts.push(ss);
    parts.push(u32le(inp.sequence));
  }

  // Outputs
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

  // nLocktime
  parts.push(u32le(psbt.fallbackLocktime));

  return bytesToHex(concat(...parts));
}

/**
 * Helper for tests / diagnostics: encode a 16-bit little-endian uint.
 */
export const _internal = { u16le, u32le, u64le };
