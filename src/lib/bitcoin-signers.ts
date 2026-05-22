import type { NostrSigner } from '@nostrify/types';
import { NSecSigner, NBrowserSigner, NConnectSigner } from '@nostrify/nostrify';
import type { NConnectSignerOpts } from '@nostrify/nostrify';
import { hex } from '@scure/base';
import * as btc from '@scure/btc-signer';
import { pubSchnorr, taprootTweakPrivKey } from '@scure/btc-signer/utils.js';

import { signPsbtLocal } from '@/lib/bitcoin';
import {
  encodePsbtV2,
  extractTxFromSignedPsbtV2,
  parsePsbtV2,
  type PsbtV2Output,
  type PsbtV2Input,
} from '@/lib/psbtV2';
import {
  deriveSilentPaymentOutputs,
  p2trScriptPubKey,
  type SilentPaymentAddress,
  type SilentPaymentInput,
  type SilentPaymentRecipient,
} from '@/lib/silentPayments';

// ---------------------------------------------------------------------------
// BtcSigner interface
// ---------------------------------------------------------------------------

/**
 * A Nostr signer extended with Bitcoin PSBT signing capability.
 *
 * Implementations receive a hex-encoded unsigned PSBT, sign all Taproot
 * inputs whose `tapInternalKey` matches the signer's key, and return the
 * hex-encoded signed (but not finalized) PSBT.
 */
export interface BtcSigner extends NostrSigner {
  signPsbt(psbtHex: string): Promise<string>;
}

/** Runtime check for whether a signer supports `signPsbt`. */
export function hasBtcSigning(signer: NostrSigner): signer is BtcSigner {
  return typeof (signer as BtcSigner).signPsbt === 'function';
}

// ---------------------------------------------------------------------------
// NSecSignerBtc — local nsec signing
// ---------------------------------------------------------------------------

/**
 * Extends `NSecSigner` with local Taproot PSBT signing.
 *
 * `NSecSigner` stores the secret key in a JS `#private` field that subclasses
 * cannot access. To work around this, the constructor accepts the raw secret
 * key bytes, passes them to `super()`, and keeps its own copy in a true
 * runtime-private `#secretKeyBytes` field so the key is not reachable via
 * property enumeration or reflection on the instance.
 *
 * **BIP-375 / silent payments.** The popup signs BIP-375 PSBT v2s by
 * detecting `PSBT_OUT_SP_V0_INFO` outputs, deriving the per-recipient
 * BIP-341 taproot output locally (we own the private key, so we can do the
 * full BIP-352 sender derivation without needing an external signer), then
 * proxying to the existing PSBT v0 signing path. We assume the input set
 * is entirely the sender's own P2TR outputs (which is the only shape this
 * wallet produces) — that lets us skip the BIP-375 input-eligibility
 * matrix and treat every UTXO as a BIP-352 eligible input.
 */
export class NSecSignerBtc extends NSecSigner implements BtcSigner {
  readonly #secretKeyBytes: Uint8Array;

  constructor(secretKey: Uint8Array) {
    super(secretKey);
    this.#secretKeyBytes = new Uint8Array(secretKey);
  }

  async signPsbt(psbtHex: string): Promise<string> {
    const privateKeyHex = hex.encode(this.#secretKeyBytes);

    // Fast path: regular PSBT v0 — just sign and return.
    if (!hasBip375SpOutputs(psbtHex)) {
      return signPsbtLocal(psbtHex, privateKeyHex);
    }

    // BIP-375 path: resolve SP outputs to P2TR, build a PSBT v0, sign it,
    // and re-emit a finalized PSBT v2 so the caller's `extractTxFromSignedPsbtV2`
    // produces the correct transaction (same outputs, same inputs, same
    // amounts — just with the previously-blank SP scriptPubKeys filled in).
    return signBip375PsbtV2Locally(psbtHex, privateKeyHex, this.#secretKeyBytes);
  }
}

/**
 * Cheap sniff: does the hex string contain at least one `PSBT_OUT_SP_V0_INFO`
 * row? Used to decide whether to take the BIP-375 fast path. A full parse
 * follows only when the cheap check matches.
 */
function hasBip375SpOutputs(psbtHex: string): boolean {
  // PSBT v2 only — peek at the version global. We look for the byte pattern
  // `0x01 0xfb 0x04 0x02 0x00 0x00 0x00` (key-len=1, keytype=0xfb VERSION,
  // val-len=4, value=2) and the `PSBT_OUT_SP_V0_INFO` key prefix
  // (`0x01 0x09`). Both heuristics keep us off the parser hot path for the
  // common PSBT v0 case.
  return /01fb0402000000/i.test(psbtHex) && /(?:^|[0-9a-f])0109/i.test(psbtHex);
}

/**
 * Resolve BIP-375 silent payment outputs in a PSBT v2 to concrete P2TR
 * outputs, build a finalized PSBT v2 (script written in, signatures
 * present), and return its hex. Assumes every input is the sender's own
 * P2TR — which is the only shape Ditto's wallet produces.
 */
function signBip375PsbtV2Locally(
  psbtHex: string,
  privateKeyHex: string,
  secretKeyBytes: Uint8Array,
): string {
  const psbt = parsePsbtV2(psbtHex);

  // Re-derive the sender's taproot internal pubkey from the private key —
  // every input's `tapInternalKey` is expected to match.
  const internalPubkey = pubSchnorr(secretKeyBytes);
  const senderPayment = btc.p2tr(internalPubkey, undefined, btc.NETWORK);
  const senderScript = senderPayment.script;

  // Derive the BIP-341 *tweaked* private key — the same scalar the wallet
  // uses to sign each P2TR input — and feed it into the BIP-352 sender
  // derivation as the input's contribution.
  const tweakedPrivKey = taprootTweakPrivKey(secretKeyBytes);

  // SP outputs are identified by an `unknown` row with keytype 0x09 (the
  // BIP-375 PSBT_OUT_SP_V0_INFO field number).
  const O_SP_V0_INFO = 0x09;

  // Resolve every SP output once, since the wallet uses every UTXO and the
  // derivation depends on the full input set's outpoints (BIP-352 picks the
  // lex-smallest outpoint for `input_hash`).
  const allOutpoints = psbt.inputs.map((i) => ({ txid: i.txid, vout: i.vout }));

  // Collect all SP recipients up-front so `deriveSilentPaymentOutputs` can
  // group them by scan key and assign `k = 0, 1, …` per group. The PSBT-
  // output order is preserved alongside so we can re-pair derived xonly
  // keys with the right `PsbtV2Output` after derivation.
  const spRecipientIndex: number[] = [];
  const spRecipients: SilentPaymentRecipient[] = [];
  const resolvedOutputs: PsbtV2Output[] = psbt.outputs.map((out, idx) => {
    if (out.script) {
      return { type: 'script', amount: out.amount, script: out.script };
    }
    const spInfo = out.unknown.find((u) => u.keyType === O_SP_V0_INFO && u.keyData.length === 0);
    if (!spInfo) {
      throw new Error('NSecSignerBtc: output is missing both PSBT_OUT_SCRIPT and PSBT_OUT_SP_V0_INFO.');
    }
    // value = 1-byte version || 33-byte scan key || 33-byte spend key
    if (spInfo.value.length !== 67) {
      throw new Error('NSecSignerBtc: invalid PSBT_OUT_SP_V0_INFO length.');
    }
    const version = spInfo.value[0];
    if (version !== 0) {
      throw new Error(`NSecSignerBtc: silent payment version ${version} is not supported by the local signer.`);
    }
    const spAddress: SilentPaymentAddress = {
      hrp: 'sp',
      network: 'mainnet',
      version: 0,
      scanPubKey: spInfo.value.slice(1, 34),
      spendPubKey: spInfo.value.slice(34, 67),
    };
    spRecipientIndex.push(idx);
    spRecipients.push({ address: spAddress });
    // Placeholder; filled in after the batch derivation below.
    return { type: 'script', amount: out.amount, script: new Uint8Array(0) };
  });

  if (spRecipients.length > 0) {
    const spInput: SilentPaymentInput = {
      txid: psbt.inputs[0].txid,
      vout: psbt.inputs[0].vout,
      privateKey: tweakedPrivKey,
      isTaproot: true,
    };
    const derived = deriveSilentPaymentOutputs([spInput], spRecipients, {
      allOutpoints,
      network: 'mainnet',
    });
    // `deriveSilentPaymentOutputs` returns outputs grouped by scan key, in
    // recipient-input order within each group. Walk the result and match
    // each derived xonly back to its original PSBT output by reference-
    // equality on the recipient object — that's how we threaded the
    // PSBT-output index through.
    for (const out of derived) {
      const i = spRecipients.indexOf(out.recipient);
      if (i < 0) throw new Error('NSecSignerBtc: derived SP output has no matching recipient.');
      const psbtIdx = spRecipientIndex[i];
      const script = p2trScriptPubKey(out.xOnlyPubKey);
      resolvedOutputs[psbtIdx] = {
        type: 'script',
        amount: psbt.outputs[psbtIdx].amount,
        script,
      };
    }
  }

  // Re-encode as a regular (script-only) PSBT v2 so we can hand it off to
  // the @scure/btc-signer PSBT v0 signing path. We emit v2 → convert to v0
  // by leveraging the library's PSBT version handling: the easiest route
  // is to use `Transaction` directly because we control every input/output.
  const tx = new btc.Transaction();
  for (const inp of psbt.inputs) {
    if (!inp.witnessUtxo) {
      throw new Error('NSecSignerBtc: input is missing witnessUtxo.');
    }
    // Verify the witness UTXO's script matches the sender's address — we
    // shouldn't be asked to sign anyone else's UTXOs.
    if (!bytesEqual(inp.witnessUtxo.script, senderScript)) {
      throw new Error('NSecSignerBtc: input is not from the sender (script mismatch).');
    }
    tx.addInput({
      txid: inp.txid,
      index: inp.vout,
      sequence: inp.sequence,
      witnessUtxo: {
        script: inp.witnessUtxo.script,
        amount: inp.witnessUtxo.amount,
      },
      tapInternalKey: internalPubkey,
    });
  }
  for (const out of resolvedOutputs) {
    if (out.type !== 'script') throw new Error('unreachable: SP output left unresolved');
    tx.addOutput({ amount: out.amount, script: out.script });
  }

  const signed = tx.sign(secretKeyBytes);
  if (signed === 0) {
    throw new Error('NSecSignerBtc: no inputs were signed.');
  }
  tx.finalize();

  // Round-trip back to a finalized PSBT v2 with the resolved scripts plus
  // the input-level final witnesses. The caller's `extractTxFromSignedPsbtV2`
  // will pull out the raw transaction hex from this.
  return finalizedTxToPsbtV2(tx, psbt.inputs, resolvedOutputs);
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/**
 * Serialize a fully-signed `@scure/btc-signer` `Transaction` back into the
 * PSBT v2 wire format with `finalScriptWitness` set on each input and
 * resolved scripts on each output. The library's own `tx.toPSBT(2)` would
 * be simpler but strips unknown fields and brings in v0/v2 hybrid
 * plumbing we don't need — re-emitting through our typed encoder, which
 * knows about `finalScriptWitness` natively, is straightforward.
 */
function finalizedTxToPsbtV2(
  tx: btc.Transaction,
  inputs: { txid: string; vout: number; sequence: number; witnessUtxo?: { amount: bigint; script: Uint8Array } }[],
  outputs: PsbtV2Output[],
): string {
  const psbtInputs: PsbtV2Input[] = [];
  for (let i = 0; i < tx.inputsLength; i++) {
    const txInp = tx.getInput(i);
    const finalWitness = (txInp.finalScriptWitness ?? []) as Uint8Array[];
    const orig = inputs[i];
    if (!orig.witnessUtxo) {
      throw new Error('finalizedTxToPsbtV2: missing witness UTXO on input.');
    }
    psbtInputs.push({
      txid: orig.txid,
      vout: orig.vout,
      sequence: orig.sequence,
      witnessUtxo: orig.witnessUtxo,
      finalScriptWitness: finalWitness.length > 0 ? finalWitness : undefined,
    });
  }

  return encodePsbtV2({ inputs: psbtInputs, outputs });
}

// Re-export so callers can do `extractTxFromSignedPsbtV2` next to the signer
// without a separate import path.
export { extractTxFromSignedPsbtV2 };

// ---------------------------------------------------------------------------
// NBrowserSignerBtc — NIP-07 extension signing
// ---------------------------------------------------------------------------

/**
 * Extends `NBrowserSigner` with NIP-07 `window.nostr.signPsbt()` support.
 *
 * Calls the extension's `signPsbt` method if available. If the extension does
 * not expose `signPsbt`, an error is thrown with a user-friendly message.
 */
export class NBrowserSignerBtc extends NBrowserSigner implements BtcSigner {
  constructor(opts?: { timeout?: number }) {
    super(opts);
  }

  async signPsbt(psbtHex: string): Promise<string> {
    // `awaitNostr` is TypeScript-private but JavaScript-public at runtime.
    const nostr = await (this as unknown as { awaitNostr(): Promise<Record<string, unknown>> }).awaitNostr();

    if (typeof nostr.signPsbt !== 'function') {
      throw new Error(
        "Your browser extension doesn't support sending Bitcoin. Try a different extension, or log in with your secret key.",
      );
    }

    const signPsbt = nostr.signPsbt as (hex: string) => Promise<string>;
    return signPsbt(psbtHex);
  }
}

// ---------------------------------------------------------------------------
// NConnectSignerBtc — NIP-46 remote signer
// ---------------------------------------------------------------------------

/**
 * Heuristics for detecting whether a NIP-46 `sign_psbt` error reflects a
 * missing-capability rejection (e.g. "method not supported", "unknown
 * command") versus a transient operational failure (network, user rejection,
 * malformed input). We have to match on strings because NIP-46 errors are
 * plain strings without structured codes.
 */
const CAPABILITY_ERROR_PATTERNS = [
  /unknown\s+(method|command)/i,
  /not\s+(implemented|supported|found)/i,
  /unsupported\s+method/i,
  /method\s+not\s+found/i,
  /invalid\s+method/i,
  /no\s+such\s+method/i,
];

function looksLikeCapabilityError(msg: string): boolean {
  return CAPABILITY_ERROR_PATTERNS.some((re) => re.test(msg));
}

/**
 * Extends `NConnectSigner` with NIP-46 `sign_psbt` RPC support.
 *
 * Sends a `sign_psbt` command over the NIP-46 relay channel. The remote
 * signer handles the TapTweak and Schnorr signing internally.
 *
 * NIP-46 returns unstructured string errors, so we use pattern matching to
 * distinguish capability failures (the signer doesn't know the method) from
 * operational failures (network, user rejection, bad input). Only capability
 * failures are re-wrapped with the "doesn't support sending Bitcoin" message
 * that flips the UI into the unsupported state; everything else propagates
 * unchanged so the caller can surface the real error.
 */
export class NConnectSignerBtc extends NConnectSigner implements BtcSigner {
  constructor(opts: NConnectSignerOpts) {
    super(opts);
  }

  async signPsbt(psbtHex: string): Promise<string> {
    // `cmd` is TypeScript-private but JavaScript-public at runtime.
    const cmd = (this as unknown as { cmd(method: string, params: string[]): Promise<string> }).cmd;
    try {
      return await cmd.call(this, 'sign_psbt', [psbtHex]);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (looksLikeCapabilityError(msg)) {
        throw new Error(
          `Your remote signer doesn't support sending Bitcoin. Update your signer, or log in with your secret key. (${msg})`,
        );
      }
      // Not a capability failure — propagate the original error so the user
      // sees the actual reason (timeout, rejection, malformed PSBT, etc.).
      throw error;
    }
  }
}
