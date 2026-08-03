import { hex } from '@scure/base';
import * as btc from '@scure/btc-signer';
import { pubSchnorr, taprootTweakPrivKey } from '@scure/btc-signer/utils.js';

import { signPsbtLocal } from '@/lib/bitcoin';
import {
  encodePsbtV2,
  parsePsbtV2,
  type PsbtV2Output,
  type PsbtV2Input,
} from '@/lib/psbtV2';
import {
  aggregateSenderPrivateKey,
  computeBip375EcdhShare,
  deriveSilentPaymentOutputs,
  p2trScriptPubKey,
  type SilentPaymentAddress,
  type SilentPaymentInput,
  type SilentPaymentRecipient,
} from '@/lib/silentPayments';
import { generateDLEQProof } from '@/lib/dleq';

/**
 * Heavy PSBT-signing implementation for {@link NSecSignerBtc}.
 *
 * This module pulls in the entire Bitcoin / PSBT / silent-payments / DLEQ
 * stack (`@scure/btc-signer`, `bitcoin.ts`, `psbtV2.ts`, `silentPayments.ts`,
 * `dleq.ts`), so it is **never** imported statically by `useCurrentUser` —
 * which loads on every page. The thin signer classes in `bitcoin-signers.ts`
 * dynamically `import()` this module only when `signPsbt` is actually called,
 * keeping the crypto out of the app's entry chunk.
 */

/** Local nsec PSBT signing — fast path for v0, BIP-375 path for SP outputs. */
export function signNsecPsbt(psbtHex: string, secretKeyBytes: Uint8Array): string {
  const privateKeyHex = hex.encode(secretKeyBytes);

  // Fast path: regular PSBT v0 — just sign and return.
  if (!hasBip375SpOutputs(psbtHex)) {
    return signPsbtLocal(psbtHex, privateKeyHex);
  }

  // BIP-375 path: resolve SP outputs to P2TR, build a PSBT v0, sign it,
  // and re-emit a finalized PSBT v2 so the caller's `extractTxFromSignedPsbtV2`
  // produces the correct transaction (same outputs, same inputs, same
  // amounts — just with the previously-blank SP scriptPubKeys filled in).
  return signBip375PsbtV2Locally(psbtHex, privateKeyHex, secretKeyBytes);
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
  _privateKeyHex: string,
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

  // Compute the BIP-375 global ECDH share + DLEQ proof per recipient scan
  // key. Per BIP-375 §"Computing the ECDH Shares and DLEQ Proofs", a single
  // signer that owns every eligible input should emit one global share per
  // scan key — which is exactly our case (all inputs are P2TR owned by the
  // sender). We attach these to the finalized PSBT v2 so an external
  // BIP-375 verifier can re-derive the output scripts without trusting us.
  const spGlobals: { scanPubKey: Uint8Array; ecdhShare: Uint8Array; dleqProof: Uint8Array }[] = [];
  if (spRecipients.length > 0) {
    const agg = aggregateSenderPrivateKey(
      [
        {
          txid: psbt.inputs[0].txid,
          vout: psbt.inputs[0].vout,
          privateKey: tweakedPrivKey,
          isTaproot: true,
        },
      ],
      allOutpoints,
    );
    // Group recipient scan keys, deduplicating so we emit one share per
    // unique scan key (multiple SP outputs to the same recipient share).
    const seen = new Map<string, Uint8Array>();
    for (const r of spRecipients) {
      const key = bytesToHexLocal(r.address.scanPubKey);
      if (!seen.has(key)) seen.set(key, r.address.scanPubKey);
    }
    for (const scanPubKey of seen.values()) {
      const ecdhShare = computeBip375EcdhShare(agg.aggregateScalar, scanPubKey);
      const auxRand = new Uint8Array(32);
      crypto.getRandomValues(auxRand);
      const { proof } = generateDLEQProof({ a: agg.aggregateScalar, B: scanPubKey, auxRand });
      spGlobals.push({ scanPubKey, ecdhShare, dleqProof: proof });
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
  // the input-level final witnesses and any BIP-375 global ECDH shares +
  // DLEQ proofs. The caller's `extractTxFromSignedPsbtV2` will pull out the
  // raw transaction hex from this.
  return finalizedTxToPsbtV2(tx, psbt.inputs, resolvedOutputs, spGlobals);
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function bytesToHexLocal(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i++) s += b[i].toString(16).padStart(2, '0');
  return s;
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
  silentPaymentGlobals?: { scanPubKey: Uint8Array; ecdhShare: Uint8Array; dleqProof: Uint8Array }[],
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

  return encodePsbtV2({
    inputs: psbtInputs,
    outputs,
    silentPaymentGlobals: silentPaymentGlobals && silentPaymentGlobals.length > 0
      ? silentPaymentGlobals
      : undefined,
    // Once we've resolved every SP output script and signed, BIP-375
    // requires `PSBT_GLOBAL_TX_MODIFIABLE` to be 0.
    txModifiable: silentPaymentGlobals && silentPaymentGlobals.length > 0 ? 0 : undefined,
  });
}
