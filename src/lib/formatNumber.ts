/**
 * Format a number into a compact human-readable string.
 *
 * - **Below 1K**: exact number (e.g. `42`, `999`)
 * - **1K–9.9K**: one decimal place (e.g. `1.7K`, `5.3K`); round thousands drop the decimal (e.g. `2K` not `2.0K`)
 * - **10K+**: whole thousands (e.g. `314K`)
 * - **Same logic around 1M**: e.g. `1.7M`, `2M`, `314M`
 */
export function formatNumber(n: number): string {
  if (n >= 1_000_000) {
    if (n >= 10_000_000) return `${Math.floor(n / 1_000_000)}M`;
    return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  }
  if (n >= 1_000) {
    if (n >= 10_000) return `${Math.floor(n / 1_000)}K`;
    return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  }
  return String(n);
}
