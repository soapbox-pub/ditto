import { useMoneroBackgroundSync } from '@/hooks/useMoneroBackgroundSync';

/**
 * Keeps the Monero wallet synced app-wide, in a Web Worker.
 *
 * Headless, mounted once near the root. Does nothing for accounts without a
 * Monero wallet, and nothing at all on platforms without `Worker` — there,
 * syncing stays confined to the wallet page. All the logic (and the reasoning)
 * lives in `useMoneroBackgroundSync`.
 */
export function MoneroBackgroundSync() {
  useMoneroBackgroundSync();
  return null;
}
