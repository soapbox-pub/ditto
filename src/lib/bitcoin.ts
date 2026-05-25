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
import { esploraFetch } from './esplora';
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

/** Standard Bitcoin dust limit in satoshis. */
const DUST_LIMIT = 546;

/** Estimated vBytes per P2TR input. */
const VBYTES_PER_INPUT = 57.5;

/** Estimated vBytes per P2TR output. */
const VBYTES_PER_OUTPUT = 43;

/** Estimated vBytes for transaction overhead (version, locktime, etc.). */
const VBYTES_OVERHEAD = 10.5;

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
// Balance / Address data (wallet page)
// ---------------------------------------------------------------------------

/** Balance data returned by the Esplora API. */
export interface AddressData {
  /** Confirmed on-chain balance in satoshis. */
  balance: number;
  /** Unconfirmed mempool balance in satoshis. */
  pendingBalance: number;
  /** Sum of confirmed + pending balance. */
  totalBalance: number;
  /** Total satoshis ever received (confirmed). */
  totalReceived: number;
  /** Total satoshis ever sent (confirmed). */
  totalSent: number;
  /** Confirmed transaction count. */
  txCount: number;
  /** Pending (mempool) transaction count. */
  pendingTxCount: number;
}

/**
 * Fetch balance and transaction stats for a Bitcoin address from an
 * Esplora-compatible REST API (e.g. mempool.space, Blockstream).
 *
 * @param address    The Bitcoin address to look up.
 * @param baseUrls   Ordered list of Esplora REST roots tried with failover.
 * @param signal     Optional abort signal (e.g. from TanStack Query).
 */
export async function fetchAddressData(
  address: string,
  baseUrls: string[],
  signal?: AbortSignal,
): Promise<AddressData> {
  const response = await esploraFetch(baseUrls, `/address/${address}`, { signal });

  if (!response.ok) {
    throw new Error('Failed to fetch balance');
  }

  const data = await response.json();

  const confirmedBalance = data.chain_stats.funded_txo_sum - data.chain_stats.spent_txo_sum;
  const pendingBalance = data.mempool_stats.funded_txo_sum - data.mempool_stats.spent_txo_sum;

  return {
    balance: confirmedBalance,
    pendingBalance,
    totalBalance: confirmedBalance + pendingBalance,
    totalReceived: data.chain_stats.funded_txo_sum,
    totalSent: data.chain_stats.spent_txo_sum,
    txCount: data.chain_stats.tx_count,
    pendingTxCount: data.mempool_stats.tx_count,
  };
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

/** Convert satoshis to a BTC string with up to 8 decimal places. */
export function satsToBTC(sats: number): string {
  return (sats / 100_000_000).toFixed(8);
}

/**
 * Convert satoshis to a BTC string with trailing zeros stripped.
 * E.g. `formatBTC(100_000_000)` → `"1"`, `formatBTC(1_234_560)` → `"0.0123456"`.
 */
export function formatBTC(sats: number): string {
  return satsToBTC(sats).replace(/\.?0+$/, '');
}

/** Format a satoshi amount with locale-aware thousand separators. */
export function formatSats(sats: number): string {
  return sats.toLocaleString();
}

/**
 * Fetch the current BTC price in USD from a mempool.space-compatible API.
 *
 * Note: the `/v1/prices` endpoint is a mempool.space extension to the
 * standard Esplora REST surface. Backends like Blockstream's Esplora do
 * not expose it — those endpoints return `404` and the failover client
 * silently advances to the next URL (without penalising the endpoint).
 *
 * @param baseUrls   Ordered list of Esplora REST roots tried with failover.
 * @param signal     Optional abort signal (e.g. from TanStack Query).
 */
export async function fetchBtcPrice(baseUrls: string[], signal?: AbortSignal): Promise<number> {
  const response = await esploraFetch(baseUrls, `/v1/prices`, {
    // /v1/prices is a mempool.space extension — 404 means "endpoint doesn't
    // speak this path", not "the endpoint is dead". Soft-failover to the
    // next URL without putting this one in cool-down.
    skipStatuses: [404],
    signal,
  });

  if (!response.ok) {
    throw new Error('Failed to fetch BTC price');
  }

  const data = await response.json();
  return data.USD;
}

/** Convert a BTC amount to satoshis (rounded to nearest integer). */
export function btcToSats(btc: number): number {
  return Math.round(btc * 100_000_000);
}

/**
 * USD threshold above which Bitcoin send/zap flows require explicit
 * confirmation (two-tap). Chosen to catch meaningful dollar amounts without
 * nagging on everyday $5–$25 zaps.
 */
export const LARGE_AMOUNT_USD_THRESHOLD = 100;

/**
 * Whether a given satoshi amount crosses the "large amount" threshold at the
 * current BTC/USD price. Returns false when `btcPrice` is unavailable, so the
 * UI does not arm confirmation without a known USD value.
 */
export function isLargeAmount(sats: number, btcPrice: number | undefined): boolean {
  if (!btcPrice || !Number.isFinite(btcPrice) || btcPrice <= 0) return false;
  if (!Number.isFinite(sats) || sats <= 0) return false;
  const usd = (sats / 100_000_000) * btcPrice;
  return usd >= LARGE_AMOUNT_USD_THRESHOLD;
}

/** Convert satoshis to USD given a BTC price. */
export function satsToUSD(sats: number, btcPrice: number): string {
  const btc = sats / 100_000_000;
  return (btc * btcPrice).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// ---------------------------------------------------------------------------
// Wallet-page transaction list (simplified per-address view)
// ---------------------------------------------------------------------------

/** A simplified transaction relevant to a specific address. */
export interface Transaction {
  /** Transaction ID (hex). */
  txid: string;
  /** Net satoshi change for the address (positive = received, negative = sent). */
  amount: number;
  /** Whether this is a receive or send relative to the address. */
  type: 'receive' | 'send';
  /** Whether the transaction is confirmed. */
  confirmed: boolean;
  /** Unix timestamp of the block (undefined if unconfirmed). */
  timestamp?: number;
}

/**
 * Fetch transactions for a Bitcoin address from an Esplora-compatible API.
 * Returns simplified transactions with net amount relative to the address.
 *
 * @param address    The Bitcoin address to look up.
 * @param baseUrls   Ordered list of Esplora REST roots tried with failover.
 * @param signal     Optional abort signal (e.g. from TanStack Query).
 */
export async function fetchTransactions(
  address: string,
  baseUrls: string[],
  signal?: AbortSignal,
): Promise<Transaction[]> {
  const response = await esploraFetch(baseUrls, `/address/${address}/txs`, { signal });

  if (!response.ok) {
    throw new Error('Failed to fetch transactions');
  }

  const txs = await response.json();

  return txs.map((tx: Record<string, unknown>) => {
    const vin = tx.vin as Array<{ prevout: { scriptpubkey_address?: string; value: number } | null }>;
    const vout = tx.vout as Array<{ scriptpubkey_address?: string; value: number }>;
    const status = tx.status as { confirmed: boolean; block_time?: number };

    // Sum sats flowing out of this address (inputs we owned)
    const totalIn = vin.reduce((sum, input) => {
      if (input.prevout?.scriptpubkey_address === address) {
        return sum + input.prevout.value;
      }
      return sum;
    }, 0);

    // Sum sats flowing into this address (outputs we own)
    const totalOut = vout.reduce((sum, output) => {
      if (output.scriptpubkey_address === address) {
        return sum + output.value;
      }
      return sum;
    }, 0);

    const net = totalOut - totalIn;

    return {
      txid: tx.txid as string,
      amount: Math.abs(net),
      type: net >= 0 ? 'receive' : 'send',
      confirmed: status.confirmed,
      timestamp: status.block_time,
    } satisfies Transaction;
  });
}

// ---------------------------------------------------------------------------
// Full transaction detail (NIP-73 /i/bitcoin:tx:... page)
// ---------------------------------------------------------------------------

/** A single input in a full transaction. */
export interface TxInput {
  txid: string;
  vout: number;
  address?: string;
  value: number;
  isCoinbase: boolean;
}

/** A single output in a full transaction. */
export interface TxOutput {
  address?: string;
  value: number;
  scriptpubkeyType: string;
  /** True if the output has been spent. */
  spent: boolean;
}

/** Full transaction detail returned by the Esplora API. */
export interface TxDetail {
  txid: string;
  version: number;
  locktime: number;
  size: number;
  weight: number;
  fee: number;
  confirmed: boolean;
  blockHeight?: number;
  blockHash?: string;
  blockTime?: number;
  inputs: TxInput[];
  outputs: TxOutput[];
  /** Total value of all inputs (sats). */
  totalInput: number;
  /** Total value of all outputs (sats). */
  totalOutput: number;
}

/**
 * Fetch full transaction details from an Esplora-compatible API.
 *
 * @param txid       The transaction ID (hex).
 * @param baseUrls   Ordered list of Esplora REST roots tried with failover.
 * @param signal     Optional abort signal (e.g. from TanStack Query).
 */
export async function fetchTxDetail(
  txid: string,
  baseUrls: string[],
  signal?: AbortSignal,
): Promise<TxDetail> {
  const response = await esploraFetch(baseUrls, `/tx/${txid}`, { signal });
  if (!response.ok) throw new Error('Failed to fetch transaction');

  const tx = await response.json();

  const vin = tx.vin as Array<{
    txid: string;
    vout: number;
    prevout: { scriptpubkey_address?: string; value: number } | null;
    is_coinbase: boolean;
  }>;
  const vout = tx.vout as Array<{
    scriptpubkey_address?: string;
    value: number;
    scriptpubkey_type: string;
  }>;
  const status = tx.status as { confirmed: boolean; block_height?: number; block_hash?: string; block_time?: number };

  const inputs: TxInput[] = vin.map((input) => ({
    txid: input.txid,
    vout: input.vout,
    address: input.prevout?.scriptpubkey_address,
    value: input.prevout?.value ?? 0,
    isCoinbase: input.is_coinbase,
  }));

  const outputs: TxOutput[] = vout.map((output) => ({
    address: output.scriptpubkey_address,
    value: output.value,
    scriptpubkeyType: output.scriptpubkey_type,
    spent: false, // Esplora /tx endpoint doesn't include spending info
  }));

  const totalInput = inputs.reduce((sum, i) => sum + i.value, 0);
  const totalOutput = outputs.reduce((sum, o) => sum + o.value, 0);

  return {
    txid: tx.txid as string,
    version: tx.version as number,
    locktime: tx.locktime as number,
    size: tx.size as number,
    weight: tx.weight as number,
    fee: tx.fee as number,
    confirmed: status.confirmed,
    blockHeight: status.block_height,
    blockHash: status.block_hash,
    blockTime: status.block_time,
    inputs,
    outputs,
    totalInput,
    totalOutput,
  };
}

// ---------------------------------------------------------------------------
// Full address detail (NIP-73 /i/bitcoin:address:... page)
// ---------------------------------------------------------------------------

/** Full address detail combining balance stats + recent transactions. */
export interface AddressDetail {
  address: string;
  balance: number;
  pendingBalance: number;
  totalBalance: number;
  totalReceived: number;
  totalSent: number;
  txCount: number;
  pendingTxCount: number;
  /** Most recent transactions (up to 25). */
  recentTxs: Transaction[];
}

/**
 * Fetch full address details (balance + recent txs) from an Esplora-compatible API.
 *
 * @param address    The Bitcoin address to look up.
 * @param baseUrls   Ordered list of Esplora REST roots tried with failover.
 * @param signal     Optional abort signal (e.g. from TanStack Query).
 */
export async function fetchAddressDetail(
  address: string,
  baseUrls: string[],
  signal?: AbortSignal,
): Promise<AddressDetail> {
  const [addrData, txs] = await Promise.all([
    fetchAddressData(address, baseUrls, signal),
    fetchTransactions(address, baseUrls, signal),
  ]);

  return {
    address,
    ...addrData,
    recentTxs: txs.slice(0, 25),
  };
}

// ---------------------------------------------------------------------------
// Sending: UTXOs, fee estimation, transaction construction, broadcast
// ---------------------------------------------------------------------------

/** An unspent transaction output. */
export interface UTXO {
  txid: string;
  vout: number;
  /** Value in satoshis. */
  value: number;
  status: {
    confirmed: boolean;
    block_height?: number;
    block_hash?: string;
    block_time?: number;
  };
}

/**
 * Fetch UTXOs for a Bitcoin address from an Esplora-compatible API.
 *
 * @param address    The Bitcoin address to look up.
 * @param baseUrls   Ordered list of Esplora REST roots tried with failover.
 * @param signal     Optional abort signal (e.g. from TanStack Query).
 */
export async function fetchUTXOs(
  address: string,
  baseUrls: string[],
  signal?: AbortSignal,
): Promise<UTXO[]> {
  const response = await esploraFetch(baseUrls, `/address/${address}/utxo`, { signal });
  if (!response.ok) throw new Error('Failed to fetch UTXOs');
  return response.json();
}

/** Fee rate estimates keyed by confirmation speed. */
export interface FeeRates {
  /** ~10 min / next block (target 1). */
  fastestFee: number;
  /** ~30 min (target 3). */
  halfHourFee: number;
  /** ~1 hour (target 6). */
  hourFee: number;
  /** ~1 day (target 144). */
  economyFee: number;
  /** Minimum relay fee (target 504). */
  minimumFee: number;
}

/**
 * Fetch recommended fee rates (sat/vB) from an Esplora-compatible API.
 *
 * @param baseUrls   Ordered list of Esplora REST roots tried with failover.
 * @param signal     Optional abort signal (e.g. from TanStack Query).
 */
export async function getFeeRates(baseUrls: string[], signal?: AbortSignal): Promise<FeeRates> {
  const response = await esploraFetch(baseUrls, `/fee-estimates`, { signal });
  if (!response.ok) throw new Error('Failed to fetch fee estimates');

  const data = await response.json();

  return {
    fastestFee: Math.ceil(data['1'] || 1),
    halfHourFee: Math.ceil(data['3'] || 1),
    hourFee: Math.ceil(data['6'] || 1),
    economyFee: Math.ceil(data['144'] || 1),
    minimumFee: Math.ceil(data['504'] || 1),
  };
}

/**
 * Estimate the fee for a P2TR transaction in satoshis.
 *
 * @param numInputs  Number of Taproot inputs.
 * @param numOutputs Number of outputs (recipient + optional change).
 * @param feeRate    Fee rate in sat/vB.
 */
export function estimateFee(numInputs: number, numOutputs: number, feeRate: number): number {
  const vBytes = numInputs * VBYTES_PER_INPUT + numOutputs * VBYTES_PER_OUTPUT + VBYTES_OVERHEAD;
  return Math.ceil(vBytes * feeRate);
}

/**
 * Validate a Bitcoin address (mainnet). Returns `true` if the address has a
 * valid format and checksum, `false` otherwise.
 */
export function validateBitcoinAddress(address: string): boolean {
  try {
    btc.Address(btc.NETWORK).decode(address);
    return true;
  } catch {
    return false;
  }
}

/**
 * Parsed BIP-21 payment URI.
 *
 * `address` is the on-chain fallback (the URI's path); `sp` is the BIP-352
 * silent payment recipient if the URI included a valid `sp=` parameter.
 * Other BIP-21 parameters (`amount`, `label`, `message`, `lightning`, …)
 * are not surfaced — the wallet UI lets the user pick the amount, and we
 * have no lightning support to fall back to.
 */
export interface ParsedBitcoinUri {
  /** On-chain address from the URI path. May be empty for sp-only URIs. */
  address: string;
  /** BIP-352 silent payment address from the `sp=` parameter, if present. */
  sp?: string;
}

/**
 * Parse a `bitcoin:` BIP-21 URI without committing to any particular address
 * format. Returns `null` for anything that isn't `bitcoin:…`.
 *
 * The scheme check is case-insensitive (`bitcoin:` and `BITCOIN:` both parse).
 * Validation of the address/sp values is left to the caller — this helper
 * just splits the URI into its parts.
 */
export function parseBitcoinUri(input: string): ParsedBitcoinUri | null {
  const trimmed = input.trim();
  if (!/^bitcoin:/i.test(trimmed)) return null;

  const payload = trimmed.slice('bitcoin:'.length);
  const qIdx = payload.indexOf('?');
  const address = (qIdx === -1 ? payload : payload.slice(0, qIdx)).trim();

  let sp: string | undefined;
  if (qIdx !== -1) {
    // URLSearchParams handles percent-decoding and repeated keys.
    const params = new URLSearchParams(payload.slice(qIdx + 1));
    sp = params.get('sp')?.trim() || undefined;
  }

  return { address, sp };
}

/**
 * Broadcast a signed transaction hex to the Bitcoin network via an
 * Esplora-compatible API. Returns the txid.
 *
 * Broadcast is idempotent at the Bitcoin protocol layer — re-broadcasting a
 * tx that's already in mempool is harmless — so we let the failover client
 * retry across endpoints normally. The first endpoint that accepts the tx
 * wins.
 *
 * @param txHex      The signed transaction hex.
 * @param baseUrls   Ordered list of Esplora REST roots tried with failover.
 * @param signal     Optional abort signal (e.g. from TanStack Query).
 */
export async function broadcastTransaction(
  txHex: string,
  baseUrls: string[],
  signal?: AbortSignal,
): Promise<string> {
  const response = await esploraFetch(baseUrls, `/tx`, {
    method: 'POST',
    body: txHex,
    signal,
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Broadcast failed: ${body}`);
  }

  return response.text();
}

/**
 * Compute the maximum sendable amount (in sats) after fees.
 *
 * @param totalBalance Total spendable sats across all UTXOs.
 * @param numInputs    Number of UTXOs that will be consumed.
 * @param feeRate      Fee rate in sat/vB.
 * @returns The max amount in sats, or 0 if the balance cannot cover fees.
 */
export function maxSendable(totalBalance: number, numInputs: number, feeRate: number): number {
  // When sending max there is no change output, so only 1 output.
  const fee = estimateFee(numInputs, 1, feeRate);
  return Math.max(0, totalBalance - fee);
}

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

