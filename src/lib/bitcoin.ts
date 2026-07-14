/**
 * Bitcoin helpers — address derivation, balance/tx fetching, fee
 * estimation, PSBT construction & signing, and broadcast.
 *
 * Every fetcher takes an ordered `baseUrls` array (Esplora REST roots, e.g.
 * `['https://mempool.space/api', 'https://blockstream.info/api']`) and routes
 * the request through {@link esploraFetch}, which handles per-attempt
 * timeouts, exponential-backoff cool-downs, and ordered failover across
 * endpoints. Callers can also pass an `AbortSignal` (typically from a
 * TanStack Query `queryFn`) to cancel the inflight request.
 *
 * The mempool.space-specific `/v1/prices` endpoint is the one exception —
 * only `mempool.space`-compatible backends expose it. {@link fetchBtcPrice}
 * configures `skipStatuses: [404]` so non-mempool backends (Blockstream's
 * Esplora) coexist in the list without being penalised.
 */
import * as btc from '@scure/btc-signer';
import { hex } from '@scure/base';
import { nip19 } from 'nostr-tools';
import {
  decodeSilentPaymentAddress,
  isSilentPaymentAddress,
  validateSilentPaymentAddress,
  type SilentPaymentAddress,
} from './silentPayments';
import { encodePsbtV2, type PsbtV2Input, type PsbtV2Output } from './psbtV2';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Fee math constants/helpers live in ./esploraApi (re-exported below).
import { DUST_LIMIT, estimateFee, type UTXO } from './esploraApi';

/**
 * Strict 32-byte hex validator. Rejects anything that isn't exactly 64
 * lowercase-or-uppercase hex characters.
 */
function isValidPubkeyHex(s: string): boolean {
  return typeof s === 'string' && /^[0-9a-fA-F]{64}$/.test(s);
}

/**
 * Decode a 32-byte (64-char) hex string to bytes. `@scure/base`'s `hex.decode`
 * only accepts lowercase, so normalise the case first.
 */
function hexToBytes(s: string): Uint8Array {
  return hex.decode(s.toLowerCase());
}

/**
 * Convert a Nostr public key (32-byte hex) to a Bitcoin Taproot (P2TR) address.
 *
 * Both Nostr and Bitcoin Taproot use secp256k1 with 32-byte x-only public keys
 * (Schnorr / BIP-340), so the key can be used directly as a Taproot internal
 * public key with no mathematical conversion.
 *
 * Returns an empty string if the input is malformed or not a valid x-only key
 * on the secp256k1 curve.
 */
export function nostrPubkeyToBitcoinAddress(pubkeyHex: string): string {
  if (!isValidPubkeyHex(pubkeyHex)) return '';

  try {
    const internalPubkey = hexToBytes(pubkeyHex);
    const payment = btc.p2tr(internalPubkey, undefined, btc.NETWORK);
    return payment.address || '';
  } catch (error) {
    console.error('Error generating Bitcoin address:', error);
    return '';
  }
}

/**
 * Convert a bech32 `npub1...` identifier to a Bitcoin Taproot (P2TR) address.
 * Decodes the npub to a hex pubkey, then delegates to {@link nostrPubkeyToBitcoinAddress}.
 */
export function npubToBitcoinAddress(npub: string): string {
  const decoded = nip19.decode(npub);
  if (decoded.type !== 'npub') {
    throw new Error('Invalid npub format');
  }
  return nostrPubkeyToBitcoinAddress(decoded.data);
}

// ---------------------------------------------------------------------------
// Esplora data plane (moved to ./esploraApi — see that module's docs)
// ---------------------------------------------------------------------------

export {
  DUST_LIMIT,
  fetchAddressData,
  fetchTransactions,
  fetchTxDetail,
  fetchAddressDetail,
  fetchUTXOs,
  getFeeRates,
  estimateFee,
  parseBitcoinUri,
  broadcastTransaction,
  maxSendable,
} from './esploraApi';
export type {
  AddressData,
  Transaction,
  TxInput,
  TxOutput,
  TxDetail,
  AddressDetail,
  UTXO,
  FeeRates,
  ParsedBitcoinUri,
} from './esploraApi';

// ---------------------------------------------------------------------------
// Light helpers (re-exported for wallet code — see each module's docs)
// ---------------------------------------------------------------------------

// Money/format helpers live in `./bitcoinMoney` so initial-load components
// (feed cards, zap amounts) can use them without pulling in the heavy
// `@scure/btc-signer` stack below.
export {
  satsToBTC,
  formatBTC,
  formatSats,
  fetchBtcPrice,
  btcToSats,
  LARGE_AMOUNT_USD_THRESHOLD,
  isLargeAmount,
  satsToUSD,
} from './bitcoinMoney';

/**
 * Validate a Bitcoin address (mainnet). Returns `true` if the address has a
 * valid format and checksum, `false` otherwise.
 *
 * Lives in the dependency-light `./bitcoinAddress` (validation is verified
 * against this module's decoder) so initial-load callers don't pull in
 * `@scure/btc-signer`; re-exported here for wallet code.
 */
export { validateBitcoinAddress } from './bitcoinAddress';

/** Result of building an unsigned PSBT. */
export interface UnsignedPsbt {
  /** Hex-encoded unsigned PSBT. */
  psbtHex: string;
  /** Fee in satoshis. */
  fee: number;
}

/**
 * Build an unsigned Taproot PSBT ready for signing.
 *
 * This function constructs the PSBT with all inputs and outputs but does NOT
 * sign it. The returned hex can be passed to any signer (local nsec, NIP-07
 * extension, or NIP-46 remote signer).
 *
 * @param senderPubkeyHex 32-byte hex x-only public key of the sender.
 * @param toAddress       Recipient Bitcoin address.
 * @param amountSats      Amount to send in satoshis.
 * @param utxos           Available UTXOs (all will be consumed).
 * @param feeRate         Fee rate in sat/vB.
 */
export function buildUnsignedPsbt(
  senderPubkeyHex: string,
  toAddress: string,
  amountSats: number,
  utxos: UTXO[],
  feeRate: number,
): UnsignedPsbt {
  return buildUnsignedPsbtMulti(
    senderPubkeyHex,
    [{ address: toAddress, amountSats }],
    utxos,
    feeRate,
  );
}

/** A single recipient output for a multi-output PSBT. */
export interface PsbtRecipient {
  /** Bitcoin address to pay. */
  address: string;
  /** Amount to send to this address in satoshis. */
  amountSats: number;
}

/**
 * Build an unsigned Taproot PSBT with multiple recipient outputs.
 *
 * Same flow as {@link buildUnsignedPsbt} but produces a single transaction
 * paying many recipients in one broadcast. Used by the "zap all" flow where
 * the sender wants to tip every member of a NIP-51 follow set / pack with one
 * signature and one network fee.
 *
 * Per-recipient amounts MUST each be at or above {@link DUST_LIMIT} (546 sats);
 * dust outputs are rejected by Bitcoin's standardness rules and the whole tx
 * would fail to broadcast. The caller is responsible for filtering small
 * recipients or bumping their amounts before calling this.
 *
 * @param senderPubkeyHex 32-byte hex x-only public key of the sender.
 * @param recipients      List of recipient (address, amountSats) pairs.
 * @param utxos           Available UTXOs (all will be consumed).
 * @param feeRate         Fee rate in sat/vB.
 */
export function buildUnsignedPsbtMulti(
  senderPubkeyHex: string,
  recipients: PsbtRecipient[],
  utxos: UTXO[],
  feeRate: number,
): UnsignedPsbt {
  if (recipients.length === 0) throw new Error('At least one recipient is required.');

  for (const r of recipients) {
    if (!Number.isFinite(r.amountSats) || r.amountSats < DUST_LIMIT) {
      throw new Error(
        `Each recipient must receive at least ${DUST_LIMIT} sats (dust limit). Got ${r.amountSats}.`,
      );
    }
  }

  const internalPubkey = hexToBytes(senderPubkeyHex);

  // Derive change address (same Taproot address as sender) and the
  // scriptPubKey used for each P2TR witness UTXO.
  const senderPayment = btc.p2tr(internalPubkey, undefined, btc.NETWORK);
  const changeAddress = senderPayment.address;
  if (!changeAddress) throw new Error('Failed to derive change address');
  const senderScript = senderPayment.script;

  const tx = new btc.Transaction();
  let totalInput = 0;

  for (const utxo of utxos) {
    tx.addInput({
      txid: utxo.txid,
      index: utxo.vout,
      witnessUtxo: {
        script: senderScript,
        amount: BigInt(utxo.value),
      },
      tapInternalKey: internalPubkey,
    });
    totalInput += utxo.value;
  }

  const totalOut = recipients.reduce((s, r) => s + r.amountSats, 0);

  // Estimate fee — first assume N + 1 outputs (recipients + change). Change
  // at the dust limit exactly is still standard, so use >= (not >) per
  // BIP-141/P2TR relay policy (minimum non-dust output is 546 sats).
  const numRecipients = recipients.length;
  const feeWithChange = estimateFee(utxos.length, numRecipients + 1, feeRate);
  const changeWithBoth = totalInput - totalOut - feeWithChange;
  const hasChange = changeWithBoth >= DUST_LIMIT;
  const numOutputs = hasChange ? numRecipients + 1 : numRecipients;
  const fee = estimateFee(utxos.length, numOutputs, feeRate);
  const change = totalInput - totalOut - fee;

  if (change < 0) {
    throw new Error(
      `Insufficient funds. Need ${(totalOut + fee).toLocaleString()} sats, have ${totalInput.toLocaleString()} sats.`,
    );
  }

  for (const r of recipients) {
    tx.addOutputAddress(r.address, BigInt(r.amountSats), btc.NETWORK);
  }

  if (hasChange) {
    tx.addOutputAddress(changeAddress, BigInt(change), btc.NETWORK);
  }

  return { psbtHex: hex.encode(tx.toPSBT()), fee };
}

/**
 * Sign a PSBT locally using a raw private key (nsec).
 *
 * `@scure/btc-signer`'s `Transaction.sign(privateKey)` handles BIP-341
 * TapTweak internally for any input whose `tapInternalKey` matches the
 * key's x-only public key. Inputs that don't match are left untouched,
 * which matters for future multi-signer PSBTs; today `buildUnsignedPsbt`
 * only ever adds the user's own UTXOs, so in practice every input matches.
 *
 * @param psbtHex       Hex-encoded unsigned PSBT.
 * @param privateKeyHex 32-byte hex private key.
 * @returns Hex-encoded signed PSBT (not finalized).
 */
export function signPsbtLocal(psbtHex: string, privateKeyHex: string): string {
  const tx = btc.Transaction.fromPSBT(hexToBytes(psbtHex));
  const privKey = hexToBytes(privateKeyHex);

  // `tx.sign` returns the number of inputs signed.
  const signedCount = tx.sign(privKey);

  if (signedCount === 0) {
    throw new Error('No inputs in this PSBT are owned by the signer.');
  }

  return hex.encode(tx.toPSBT());
}

/**
 * Finalize a signed PSBT and extract the raw transaction hex.
 *
 * @param psbtHex Hex-encoded signed PSBT.
 * @returns Raw transaction hex ready for broadcast.
 */
export function finalizePsbt(psbtHex: string): string {
  const tx = btc.Transaction.fromPSBT(hexToBytes(psbtHex));
  tx.finalize();
  return hex.encode(tx.extract());
}

/**
 * Create, sign, and return a raw Bitcoin Taproot transaction.
 *
 * Convenience wrapper that calls {@link buildUnsignedPsbt},
 * {@link signPsbtLocal}, and {@link finalizePsbt} in sequence.
 *
 * @param privateKeyHex 32-byte hex private key (from Nostr nsec).
 * @param toAddress     Recipient Bitcoin address.
 * @param amountSats    Amount to send in satoshis.
 * @param utxos         Available UTXOs (all will be consumed).
 * @param feeRate       Fee rate in sat/vB.
 * @returns The signed transaction hex and the fee paid.
 */
export function createBitcoinTransaction(
  privateKeyHex: string,
  toAddress: string,
  amountSats: number,
  utxos: UTXO[],
  feeRate: number,
): { txHex: string; fee: number } {
  // Derive the x-only pubkey from the private key for buildUnsignedPsbt
  const internalPubkey = btc.utils.pubSchnorr(hexToBytes(privateKeyHex));
  const senderPubkeyHex = hex.encode(internalPubkey);

  const { psbtHex, fee } = buildUnsignedPsbt(senderPubkeyHex, toAddress, amountSats, utxos, feeRate);
  const signedHex = signPsbtLocal(psbtHex, privateKeyHex);
  const txHex = finalizePsbt(signedHex);

  return { txHex, fee };
}

// ---------------------------------------------------------------------------
// BIP-352 / BIP-375 silent payment sends (sp1… / tsp1…)
// ---------------------------------------------------------------------------
//
// Silent payment recipients hand out a static `sp1…` address that the
// sender's wallet turns into a per-transaction BIP-341 taproot output. The
// transformation depends on the sender's input set (BIP-352
// `outpoint_L · a · B_scan`), so the on-chain output isn't computable
// without either:
//
//   (a) the sender's private key (the local nsec path) — we decode the SP
//       address ourselves and embed the derived P2TR in a regular PSBT v0
//       before signing, or
//   (b) the signer (NIP-07 / NIP-46) supporting BIP-375 — we hand it a
//       PSBT v2 carrying `PSBT_OUT_SP_V0_INFO`, and the signer fills in the
//       output script while signing.
//
// {@link buildUnsignedSilentPaymentPsbt} produces the PSBT v2 + BIP-375
// flavour that any signer of the latter shape can consume. The local
// `NSecSignerBtc.signPsbt` short-circuits this by detecting the BIP-375
// fields in the PSBT v2 and resolving the SP output before signing.

/**
 * Cheap routing predicate for the recipient picker.
 *
 * Returns `true` iff `s` looks like a silent payment address. A `true`
 * here only commits the UI to treating the input as an SP address; full
 * validation happens at coin-selection time.
 */
export function looksLikeSilentPaymentAddress(s: string): boolean {
  return isSilentPaymentAddress(s);
}

/**
 * Validate a silent payment address, returning the decoded scan/spend
 * pubkeys on success or `null` on failure.
 *
 * Use for inline form validation. The reason `null` (rather than throwing)
 * is that pickers may speculatively check half-typed addresses.
 */
export function validateAndDecodeSilentPaymentAddress(addr: string): SilentPaymentAddress | null {
  try {
    return decodeSilentPaymentAddress(addr);
  } catch {
    return null;
  }
}

/** Re-export the cheap check so callers don't have to reach into `silentPayments`. */
export { validateSilentPaymentAddress };

/**
 * Build an unsigned PSBT v2 + BIP-375 transaction paying a single silent
 * payment recipient.
 *
 * The PSBT carries the recipient as a `PSBT_OUT_SP_V0_INFO` (no
 * `PSBT_OUT_SCRIPT`), plus a regular change output to the sender. The
 * signer (any of nsec, NIP-07, NIP-46 — all of which we route through
 * `BtcSigner.signPsbt`) is expected to:
 *
 *   1. derive the recipient's per-transaction P2TR output from the SP
 *      address and the input set's ECDH share,
 *   2. write the result into `PSBT_OUT_SCRIPT`,
 *   3. sign each input (SIGHASH_ALL only, per BIP-375),
 *   4. return a finalized PSBT v2 we can extract with
 *      {@link extractTxFromSignedPsbtV2}.
 *
 * BIP-375 forbids inputs with witness version > 1. Ditto's wallet only
 * spends from the sender's own P2TR (witness v1) UTXOs, so we never hit
 * that constraint, but the check is still applied here for safety.
 *
 * Mainnet only — the wallet doesn't support testnet UTXOs anywhere.
 *
 * @param senderPubkeyHex 32-byte hex x-only public key of the sender (used
 *                        for the change output and as the tapInternalKey).
 * @param spAddress       The recipient's `sp1…` silent payment address.
 * @param amountSats      Amount to send in satoshis.
 * @param utxos           Available UTXOs (all are consumed).
 * @param feeRate         Fee rate in sat/vB.
 */
export function buildUnsignedSilentPaymentPsbt(
  senderPubkeyHex: string,
  spAddress: string,
  amountSats: number,
  utxos: UTXO[],
  feeRate: number,
): UnsignedPsbt {
  if (!isValidPubkeyHex(senderPubkeyHex)) {
    throw new Error('Silent payment send: invalid sender pubkey.');
  }
  if (utxos.length === 0) {
    throw new Error('Silent payment send: no UTXOs available.');
  }
  if (!Number.isFinite(amountSats) || amountSats < 546) {
    throw new Error(`Silent payment send: amount must be at least 546 sats (got ${amountSats}).`);
  }

  // ── 1. Decode the silent payment address ──
  const sp = decodeSilentPaymentAddress(spAddress);
  if (sp.network !== 'mainnet') {
    throw new Error('Silent payment send: testnet addresses are not supported.');
  }
  if (sp.version !== 0) {
    // Forward-compat: the BIP defines v0 today; v1+ are reserved for future
    // upgrades and we refuse them rather than silently truncating the
    // payload (which is what the BIP allows for v1-v30 receivers).
    throw new Error(`Silent payment send: address version ${sp.version} is not yet supported.`);
  }

  const internalPubkey = hexToBytes(senderPubkeyHex);
  const senderPayment = btc.p2tr(internalPubkey, undefined, btc.NETWORK);
  const changeAddress = senderPayment.address;
  if (!changeAddress) throw new Error('Silent payment send: failed to derive change address.');
  const senderScript = senderPayment.script;

  // The change scriptPubKey (also P2TR) goes into the change output if any.
  const changeScript = senderScript;

  // ── 2. Fee + change calculation (mirrors buildUnsignedPsbtMulti) ──
  const totalInput = utxos.reduce((s, u) => s + u.value, 0);
  const feeWithChange = estimateFee(utxos.length, 2, feeRate);
  const changeWithBoth = totalInput - amountSats - feeWithChange;
  const hasChange = changeWithBoth >= DUST_LIMIT;
  const numOutputs = hasChange ? 2 : 1;
  const fee = estimateFee(utxos.length, numOutputs, feeRate);
  const change = totalInput - amountSats - fee;
  if (change < 0) {
    throw new Error(
      `Insufficient funds. Need ${(amountSats + fee).toLocaleString()} sats, have ${totalInput.toLocaleString()} sats.`,
    );
  }

  // ── 3. PSBT v2 input set ──
  const psbtInputs: PsbtV2Input[] = utxos.map((u) => ({
    txid: u.txid,
    vout: u.vout,
    witnessUtxo: { amount: BigInt(u.value), script: senderScript },
    tapInternalKey: internalPubkey,
  }));

  // ── 4. Outputs: SP recipient (no script) + optional change (script) ──
  const psbtOutputs: PsbtV2Output[] = [
    {
      type: 'sp',
      amount: BigInt(amountSats),
      scanPubKey: sp.scanPubKey,
      spendPubKey: sp.spendPubKey,
    },
  ];
  if (hasChange) {
    psbtOutputs.push({
      type: 'script',
      amount: BigInt(change),
      script: changeScript,
    });
  }

  const psbtHex = encodePsbtV2({
    inputs: psbtInputs,
    outputs: psbtOutputs,
  });

  return { psbtHex, fee };
}

