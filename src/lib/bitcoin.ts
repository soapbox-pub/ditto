import * as bitcoin from 'bitcoinjs-lib';

/**
 * Convert a Nostr public key (32-byte hex) to a Bitcoin Taproot (P2TR) address.
 *
 * Both Nostr and Bitcoin Taproot use secp256k1 with 32-byte x-only public keys
 * (Schnorr / BIP-340), so the key can be used directly as a Taproot internal
 * public key with no mathematical conversion.
 */
export function nostrPubkeyToBitcoinAddress(pubkeyHex: string): string {
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

/** Balance data returned by the Blockstream API. */
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
 * Blockstream Esplora API.
 */
export async function fetchAddressData(address: string): Promise<AddressData> {
  const response = await fetch(`https://blockstream.info/api/address/${address}`);

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

/** Convert satoshis to a BTC string with up to 8 decimal places. */
export function satsToBTC(sats: number): string {
  return (sats / 100_000_000).toFixed(8);
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
