/**
 * A simple in-memory session cache for storing small pieces of data
 * with an optional TTL.
 */
export class SessionCache {
  private cache = new Map<string, { value: any; expires?: number }>();

  /**
   * Set a value in the cache
   * @param key The cache key
   * @param value The value to store
   * @param ttlSec Optional TTL in seconds
   */
  set(key: string, value: any, ttlSec?: number): void {
    const expires = ttlSec ? Date.now() + (ttlSec * 1000) : undefined;
    this.cache.set(key, { value, expires });
  }

  /**
   * Get a value from the cache
   * @param key The cache key
   * @returns The cached value or undefined if not found or expired
   */
  get(key: string): any {
    const item = this.cache.get(key);

    if (!item) {
      return undefined;
    }

    if (item.expires && item.expires < Date.now()) {
      this.cache.delete(key);
      return undefined;
    }

    return item.value;
  }

  /**
   * Remove a value from the cache
   * @param key The cache key
   */
  delete(key: string): void {
    this.cache.delete(key);
  }

  /**
   * Clear all values from the cache
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Run cleanup to remove expired items
   */
  cleanup(): void {
    const now = Date.now();
    for (const [key, item] of this.cache.entries()) {
      if (item.expires && item.expires < now) {
        this.cache.delete(key);
      }
    }
  }
}

// Create and export a singleton instance
export const sessionCache = new SessionCache();

// Run cleanup every minute
setInterval(() => {
  sessionCache.cleanup();
}, 60 * 1000);
