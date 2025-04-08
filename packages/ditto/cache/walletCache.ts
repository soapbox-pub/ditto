import { Wallet } from '@ditto/cashu';
import { logi } from '@soapbox/logi';
import { errorJson } from '@/utils/log.ts';

/**
 * A simple in-memory cache for wallet data
 * - Keys are pubkeys
 * - Values are wallet data and timestamp
 */
interface CachedWallet {
  wallet: Wallet;
  timestamp: number;
  lastQueryTimestamp: number;
}

export class WalletCache {
  private cache = new Map<string, CachedWallet>();
  private ttlMs: number;
  private queryTtlMs: number;

  /**
   * @param ttlSec Cache TTL in seconds
   * @param queryTtlSec How long we should wait between full queries in seconds
   */
  constructor(ttlSec = 60, queryTtlSec = 5) {
    this.ttlMs = ttlSec * 1000;
    this.queryTtlMs = queryTtlSec * 1000;

    // Periodic cleanup
    setInterval(() => this.cleanup(), 60 * 1000);
  }

  /**
   * Get wallet from cache
   * @param pubkey User's pubkey
   * @returns The cached wallet if present and valid, null otherwise
   */
  get(pubkey: string): { wallet: Wallet; shouldRefresh: boolean } | null {
    const entry = this.cache.get(pubkey);
    if (!entry) {
      return null;
    }

    const now = Date.now();
    const age = now - entry.timestamp;

    // If cache entry is too old, consider it invalid
    if (age > this.ttlMs) {
      return null;
    }

    // Check if we should refresh the data in the background
    // This is determined by how long since the last full query
    const queryAge = now - entry.lastQueryTimestamp;
    const shouldRefresh = queryAge > this.queryTtlMs;

    return { wallet: entry.wallet, shouldRefresh };
  }

  /**
   * Store wallet in cache
   * @param pubkey User's pubkey
   * @param wallet Wallet data
   * @param isQueryResult Whether this is from a full query or just a balance update
   */
  set(pubkey: string, wallet: Wallet, isQueryResult = true): void {
    const now = Date.now();
    const existing = this.cache.get(pubkey);

    this.cache.set(pubkey, {
      wallet,
      timestamp: now,
      // If this is just a balance update, preserve the lastQueryTimestamp
      lastQueryTimestamp: isQueryResult ? now : (existing?.lastQueryTimestamp || now),
    });
  }

  /**
   * Update balance for a wallet without doing a full refresh
   * @param pubkey User's pubkey
   * @param deltaAmount Amount to add to balance (negative to subtract)
   * @returns true if updated, false if wallet not in cache
   */
  updateBalance(pubkey: string, deltaAmount: number): boolean {
    const entry = this.cache.get(pubkey);
    if (!entry) {
      return false;
    }

    const newWallet = {
      ...entry.wallet,
      balance: entry.wallet.balance + deltaAmount,
    };

    this.set(pubkey, newWallet, false);
    return true;
  }

  /**
   * Remove expired entries from cache
   */
  private cleanup(): void {
    const now = Date.now();
    let deletedCount = 0;

    for (const [pubkey, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.ttlMs) {
        this.cache.delete(pubkey);
        deletedCount++;
      }
    }

    if (deletedCount > 0) {
      logi({
        level: 'debug',
        ns: 'ditto.cache.wallet',
        message: `Cleaned up ${deletedCount} expired wallet cache entries`,
      });
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): { size: number } {
    return {
      size: this.cache.size,
    };
  }
}

// Singleton instance
export const walletCache = new WalletCache();
