/**
 * Format a number into a compact human-readable string.
 *
 * - **Below 1k**: exact number (e.g. `42`, `999`)
 * - **1k–9.9k**: one decimal place (e.g. `1.7k`, `5.3k`); round thousands drop the decimal (e.g. `2k` not `2.0k`)
 * - **10k+**: whole thousands (e.g. `314k`)
 * - **Same logic around 1M**: e.g. `1.7M`, `2M`, `314M`
 */
export function formatNumber(n: number): string {
  if (n >= 1_000_000) {
    if (n >= 10_000_000) return `${Math.floor(n / 1_000_000)}M`;
    return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  }
  if (n >= 1_000) {
    if (n >= 10_000) return `${Math.floor(n / 1_000)}k`;
    return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}k`;
  }
  return String(n);
}
