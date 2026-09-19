/**
 * Estimating a Monero block height from a date, without a daemon.
 *
 * Monero targets a 120-second block, and the difficulty algorithm holds that
 * closely, so height and wall-clock time are interconvertible from a single
 * known (height, timestamp) pair. Every serious Monero wallet ships some form
 * of this table — Feather carries 2481 measured rows, Monerujo a monthly map
 * interpolated at 120s/block — because the alternative is asking a node, and
 * you frequently need an answer before you have one.
 *
 * Ditto needs it for exactly one thing: the restore height of a **newly
 * created** wallet. Such a wallet has no history by definition, so the correct
 * restore height is the chain tip at the moment it was generated. Getting that
 * from a node would put key generation back behind the network, which is the
 * coupling `createWallet()` exists to avoid.
 *
 * `wallet2` has its own estimate and needs no daemon either, but it is derived
 * from checkpoints baked in when `monero-ts` was built — for v0.11.15 that is
 * roughly 21,500 blocks (about a month) behind the real tip. Scanning a month
 * of blocks to find the zero transactions a brand-new wallet cannot have is
 * pure waste, which is what this module removes.
 */

/**
 * A real chain tip, read from `get_last_block_header` on
 * `xmr-node.cakewallet.com` and cross-checked against `node.sethforprivacy.com`.
 *
 * Refreshing this is optional — the estimate degrades slowly and the safety
 * margin below absorbs the drift — but it costs nothing to update when you
 * happen to be in here.
 */
export const HEIGHT_CHECKPOINT = {
  /** Block height at `timestamp`. */
  height: 3_765_647,
  /** Unix seconds. 2026-09-19T04:59:43Z. */
  timestamp: 1_789_793_983,
} as const;

/** Monero's target block interval, in seconds (`DIFFICULTY_TARGET_V2`). */
export const BLOCK_TIME_SECONDS = 120;

/**
 * Blocks subtracted from the estimated tip when setting a new wallet's restore
 * height — one day's worth.
 *
 * Insurance, not precision. It covers a slow clock, a stale checkpoint, and
 * the gap between generating a wallet and first syncing it. Overshooting the
 * real tip is the one failure that actually loses money (outputs received in
 * the skipped window are never scanned), while undershooting only costs a few
 * seconds of scanning empty blocks. So the margin is deliberately lopsided.
 */
export const NEW_WALLET_MARGIN_BLOCKS = 720;

/**
 * Estimate the chain height at a given time.
 *
 * Clamped at the checkpoint height: this is only ever used to look *forward*
 * from a known point, and a caller asking about 2019 should not receive a
 * confidently wrong small number.
 */
export function estimateHeightAt(when: Date | number = Date.now()): number {
  const seconds = Math.floor((when instanceof Date ? when.getTime() : when) / 1000);
  const elapsed = seconds - HEIGHT_CHECKPOINT.timestamp;
  const blocks = Math.floor(elapsed / BLOCK_TIME_SECONDS);
  return Math.max(HEIGHT_CHECKPOINT.height, HEIGHT_CHECKPOINT.height + blocks);
}

/**
 * The restore height for a wallet generated at `createdAt`.
 *
 * `floor` is a lower bound the result is never allowed to fall below — pass
 * `wallet2`'s own estimate, so that if this module's checkpoint is ever the
 * more pessimistic of the two, we still use the better number.
 */
export function restoreHeightForNewWallet(
  createdAt: Date | number = Date.now(),
  floor = 0,
): number {
  return Math.max(floor, estimateHeightAt(createdAt) - NEW_WALLET_MARGIN_BLOCKS);
}
