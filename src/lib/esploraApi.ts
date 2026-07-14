/**
 * Esplora REST data plane — balances, transactions, UTXOs, fee estimates,
 * and broadcast, plus the pure fee-math and BIP-21 URI helpers.
 *
 * Everything here is plain `fetch` (via the failover client in
 * `./esplora`) and arithmetic — deliberately free of `@scure/btc-signer`
 * so initial-load callers (feed cards verifying on-chain zaps, campaign
 * donation totals, bitcoin: URI previews) don't pull the ~150 kB
 * transaction-signing stack in `@/lib/bitcoin` into the entry bundle.
 * `@/lib/bitcoin` re-exports everything here, so wallet code can keep
 * importing from one place.
 */
import { esploraFetch } from './esplora';

/** Standard Bitcoin dust limit in satoshis. */
export const DUST_LIMIT = 546;

/** Estimated vBytes per P2TR input. */
export const VBYTES_PER_INPUT = 57.5;

/** Estimated vBytes per P2TR output. */
export const VBYTES_PER_OUTPUT = 43;

/** Estimated vBytes for transaction overhead (version, locktime, etc.). */
export const VBYTES_OVERHEAD = 10.5;

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
  const response = await esploraFetch(baseUrls, `/address/${address}`, { signal, retryStatuses: [404] });

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
  const response = await esploraFetch(baseUrls, `/address/${address}/txs`, { signal, retryStatuses: [404] });

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
  const response = await esploraFetch(baseUrls, `/address/${address}/utxo`, { signal, retryStatuses: [404] });
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
  // `/fee-estimates` is always present on a healthy Esplora backend, so a 404
  // never means "not found" — it means the endpoint is misbehaving (notably
  // mempool.space serving 404 instead of 429 to rate-limited mobile clients).
  // Treat it as a retryable failure so we fail over to the next endpoint
  // instead of trusting the 404 and giving up.
  const response = await esploraFetch(baseUrls, `/fee-estimates`, { signal, retryStatuses: [404] });
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
 * Parsed BIP-21 payment URI.
 *
 * `address` is the on-chain fallback (the URI's path); `sp` is the BIP-352
 * silent payment recipient if the URI included a valid `sp=` parameter;
 * `amountSats` is the BIP-21 `amount=` parameter converted from BTC to
 * satoshis. Other BIP-21 parameters (`label`, `message`, `lightning`, …) are
 * not surfaced — we have no lightning support to fall back to.
 */
export interface ParsedBitcoinUri {
  /** On-chain address from the URI path. May be empty for sp-only URIs. */
  address: string;
  /** BIP-352 silent payment address from the `sp=` parameter, if present. */
  sp?: string;
  /**
   * Amount in satoshis, parsed from the BIP-21 `amount=` parameter (which is
   * specified in BTC). Undefined when the URI has no amount or the value is
   * malformed / non-positive / non-finite. Rounded down to whole sats so we
   * never overstate the requester's intent.
   */
  amountSats?: number;
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
  let amountSats: number | undefined;
  if (qIdx !== -1) {
    // URLSearchParams handles percent-decoding and repeated keys.
    const params = new URLSearchParams(payload.slice(qIdx + 1));
    sp = params.get('sp')?.trim() || undefined;

    const amountRaw = params.get('amount')?.trim();
    if (amountRaw) {
      const btc = Number(amountRaw);
      if (Number.isFinite(btc) && btc > 0) {
        // Round down — never overstate the requested amount.
        amountSats = Math.floor(btc * 100_000_000);
      }
    }
  }

  return { address, sp, amountSats };
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
    // A 404 on broadcast is never a legitimate "not found" — fail over.
    retryStatuses: [404],
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
