import * as bitcoin from 'bitcoinjs-lib';
import { toXOnly } from 'bitcoinjs-lib';
import { nip19 } from 'nostr-tools';
import * as ecc from '@bitcoinerlab/secp256k1';
import { ECPairFactory, type ECPairAPI } from 'ecpair';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Base URL for the mempool.space Esplora-compatible REST API. */
const MEMPOOL_API = 'https://mempool.space/api';

/** Standard Bitcoin dust limit in satoshis. */
const DUST_LIMIT = 546;

/** Estimated vBytes per P2TR input. */
const VBYTES_PER_INPUT = 57.5;

/** Estimated vBytes per P2TR output. */
const VBYTES_PER_OUTPUT = 43;

/** Estimated vBytes for transaction overhead (version, locktime, etc.). */
const VBYTES_OVERHEAD = 10.5;

// ---------------------------------------------------------------------------
// ECC initialisation (lazy)
// ---------------------------------------------------------------------------

let _ECPair: ECPairAPI | null = null;

function getECPair(): ECPairAPI {
  if (!_ECPair) {
    bitcoin.initEccLib(ecc);
    _ECPair = ECPairFactory(ecc);
  }
  return _ECPair;
}

/**
 * Strict 32-byte hex validator. Rejects anything that isn't exactly 64
 * lowercase-or-uppercase hex characters.
 */
function isValidPubkeyHex(hex: string): boolean {
  return typeof hex === 'string' && /^[0-9a-fA-F]{64}$/.test(hex);
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
    const pubkeyBuffer = Buffer.from(pubkeyHex, 'hex');

    const { address } = bitcoin.payments.p2tr({
      internalPubkey: pubkeyBuffer,
      network: bitcoin.networks.bitcoin,
    });

    return address || '';
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
 * Fetch balance and transaction stats for a Bitcoin address from the
 * mempool.space Esplora API.
 */
export async function fetchAddressData(address: string): Promise<AddressData> {
  const response = await fetch(`${MEMPOOL_API}/address/${address}`);

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

/** Fetch the current BTC price in USD from the CoinGecko API. */
export async function fetchBtcPrice(): Promise<number> {
  const response = await fetch(
    'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd',
  );

  if (!response.ok) {
    throw new Error('Failed to fetch BTC price');
  }

  const data = await response.json();
  return data.bitcoin.usd;
}

/** Convert a BTC amount to satoshis (rounded to nearest integer). */
export function btcToSats(btc: number): number {
  return Math.round(btc * 100_000_000);
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
 * Fetch transactions for a Bitcoin address from the mempool.space Esplora API.
 * Returns simplified transactions with net amount relative to the address.
 */
export async function fetchTransactions(address: string): Promise<Transaction[]> {
  const response = await fetch(`${MEMPOOL_API}/address/${address}/txs`);

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

/** Fetch full transaction details from mempool.space. */
export async function fetchTxDetail(txid: string): Promise<TxDetail> {
  const response = await fetch(`${MEMPOOL_API}/tx/${txid}`);
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

/** Fetch full address details (balance + recent txs) from mempool.space. */
export async function fetchAddressDetail(address: string): Promise<AddressDetail> {
  const [addrData, txs] = await Promise.all([
    fetchAddressData(address),
    fetchTransactions(address),
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

/** Fetch UTXOs for a Bitcoin address from mempool.space. */
export async function fetchUTXOs(address: string): Promise<UTXO[]> {
  const response = await fetch(`${MEMPOOL_API}/address/${address}/utxo`);
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

/** Fetch recommended fee rates (sat/vB) from mempool.space. */
export async function getFeeRates(): Promise<FeeRates> {
  const response = await fetch(`${MEMPOOL_API}/fee-estimates`);
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
    bitcoin.address.toOutputScript(address, bitcoin.networks.bitcoin);
    return true;
  } catch {
    return false;
  }
}

/** Broadcast a signed transaction hex to the Bitcoin network via mempool.space. Returns the txid. */
export async function broadcastTransaction(txHex: string): Promise<string> {
  const response = await fetch(`${MEMPOOL_API}/tx`, {
    method: 'POST',
    body: txHex,
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
  const internalPubkey = Buffer.from(senderPubkeyHex, 'hex');

  // Derive change address (same Taproot address as sender)
  const { address: changeAddress } = bitcoin.payments.p2tr({
    internalPubkey,
    network: bitcoin.networks.bitcoin,
  });
  if (!changeAddress) throw new Error('Failed to derive change address');

  // Build PSBT, add all UTXOs as inputs
  const psbt = new bitcoin.Psbt({ network: bitcoin.networks.bitcoin });
  let totalInput = 0;

  for (const utxo of utxos) {
    psbt.addInput({
      hash: utxo.txid,
      index: utxo.vout,
      witnessUtxo: {
        script: bitcoin.payments.p2tr({
          internalPubkey,
          network: bitcoin.networks.bitcoin,
        }).output!,
        value: BigInt(utxo.value),
      },
      tapInternalKey: internalPubkey,
    });
    totalInput += utxo.value;
  }

  // Estimate fee — first assume 2 outputs (recipient + change). Change at the
  // dust limit exactly is still standard, so use >= (not >) per BIP-141/P2TR
  // relay policy (minimum non-dust output is 546 sats).
  const change2Out = totalInput - amountSats - estimateFee(utxos.length, 2, feeRate);
  const hasChange = change2Out >= DUST_LIMIT;
  const numOutputs = hasChange ? 2 : 1;
  const fee = estimateFee(utxos.length, numOutputs, feeRate);
  const change = totalInput - amountSats - fee;

  if (change < 0) {
    throw new Error(
      `Insufficient funds. Need ${(amountSats + fee).toLocaleString()} sats, have ${totalInput.toLocaleString()} sats.`,
    );
  }

  // Add outputs
  psbt.addOutput({ address: toAddress, value: BigInt(amountSats) });

  if (hasChange) {
    psbt.addOutput({ address: changeAddress, value: BigInt(change) });
  }

  return { psbtHex: psbt.toHex(), fee };
}

/**
 * Sign a PSBT locally using a raw private key (nsec).
 *
 * Applies the BIP-341 TapTweak to the private key, signs all inputs whose
 * `tapInternalKey` matches, and returns the signed (but not finalized) PSBT hex.
 *
 * @param psbtHex       Hex-encoded unsigned PSBT.
 * @param privateKeyHex 32-byte hex private key.
 * @returns Hex-encoded signed PSBT (not finalized).
 */
export function signPsbtLocal(psbtHex: string, privateKeyHex: string): string {
  bitcoin.initEccLib(ecc);
  const psbt = bitcoin.Psbt.fromHex(psbtHex, { network: bitcoin.networks.bitcoin });

  const keyPair = getECPair().fromPrivateKey(Buffer.from(privateKeyHex, 'hex'));
  const internalPubkey = toXOnly(keyPair.publicKey);

  // Tweak private key for Taproot key-path spending (BIP-341)
  const tweakedSigner = keyPair.tweak(
    bitcoin.crypto.taggedHash('TapTweak', internalPubkey),
  );

  // Per the NIP spec: inputs whose `tapInternalKey` does not match the
  // signer's x-only pubkey MUST be left unchanged. This matters for future
  // multi-signer PSBTs; today `buildUnsignedPsbt` only ever adds the user's
  // own UTXOs, so in practice every input matches.
  let signedAny = false;
  for (let i = 0; i < psbt.inputCount; i++) {
    const input = psbt.data.inputs[i];
    const inputInternalKey = input.tapInternalKey;
    if (!inputInternalKey || !Buffer.from(inputInternalKey).equals(Buffer.from(internalPubkey))) {
      continue;
    }
    psbt.signInput(i, tweakedSigner);
    signedAny = true;
  }

  if (!signedAny) {
    throw new Error('No inputs in this PSBT are owned by the signer.');
  }

  return psbt.toHex();
}

/**
 * Finalize a signed PSBT and extract the raw transaction hex.
 *
 * @param psbtHex Hex-encoded signed PSBT.
 * @returns Raw transaction hex ready for broadcast.
 */
export function finalizePsbt(psbtHex: string): string {
  bitcoin.initEccLib(ecc);
  const psbt = bitcoin.Psbt.fromHex(psbtHex, { network: bitcoin.networks.bitcoin });
  psbt.finalizeAllInputs();
  return psbt.extractTransaction().toHex();
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
  const keyPair = getECPair().fromPrivateKey(Buffer.from(privateKeyHex, 'hex'));
  const internalPubkey = toXOnly(keyPair.publicKey);
  const senderPubkeyHex = Buffer.from(internalPubkey).toString('hex');

  const { psbtHex, fee } = buildUnsignedPsbt(senderPubkeyHex, toAddress, amountSats, utxos, feeRate);
  const signedHex = signPsbtLocal(psbtHex, privateKeyHex);
  const txHex = finalizePsbt(signedHex);

  return { txHex, fee };
}
