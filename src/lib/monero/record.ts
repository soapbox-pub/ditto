/**
 * The encrypted Monero wallet record stored in NIP-78 (kind 30078).
 *
 * ## Why a stored record at all
 *
 * Ditto's Bitcoin wallet needs no storage: a Nostr pubkey *is* a Taproot
 * internal key, so the address and the signing key are both derived from the
 * identity the user already has (see `WALLET.md`). Monero shares none of that
 * — it's Ed25519 with a separate view/spend keypair — so a Monero wallet has
 * key material that exists nowhere else and must be created once and then
 * persisted, or the funds are gone.
 *
 * We put it in an encrypted kind-30078 event so the wallet follows the user
 * across devices with no new infrastructure, the same way every other Ditto
 * setting does.
 *
 * ## What goes in, and what deliberately does not
 *
 * The record holds the **seed** (plus the passphrase-derived offset flag and
 * restore height) and a small **summary** of wallet state. It does *not* hold
 * wallet2's transaction cache.
 *
 * That split is forced by size. The cache is the output set wallet2 needs to
 * select inputs, and it grows with history — hundreds of KB to many MB. Nostr
 * relays commonly cap events at 64–256 KB, so pushing the cache through one is
 * not viable. It lives in IndexedDB instead (see `./cache.ts`).
 *
 * The consequence is worth stating plainly: the summary makes a **balance**
 * appear instantly on a new device, but **sending** from a device that has
 * never synced still requires a sync first, because the outputs aren't there.
 * There is no way around that short of handing a view key to a light-wallet
 * server, which is the privacy trade Ditto is specifically avoiding.
 *
 * ## Security
 *
 * The record is NIP-44-encrypted to the user's own pubkey, so its security is
 * exactly the security of their Nostr key. For an `nsec` login that key sits
 * in `localStorage`, which means an XSS that reaches it also reaches the
 * Monero seed. This is the same exposure the derived Bitcoin wallet already
 * has — there the Nostr key *is* the spending key — so Monero adds no new
 * class of risk, but it does put a second balance behind the same door.
 * Extension and bunker logins are strictly better here: the Nostr key never
 * enters the page, and every read of the record costs a signer round-trip.
 */
import { z } from 'zod';

/** `d` tag suffix for the wallet record, appended to `config.appId`. */
export const MONERO_RECORD_D_SUFFIX = 'monero-wallet';

/** Current record schema version. Bump when the shape changes incompatibly. */
export const MONERO_RECORD_VERSION = 1;

/**
 * A cached transaction summary.
 *
 * Just enough to render the history list before a sync completes. Amounts are
 * decimal strings, not `bigint`, because this is JSON.
 */
export const MoneroTxSummarySchema = z.object({
  /** Transaction hash. */
  hash: z.string(),
  /** Atomic units, as a decimal string. */
  amount: z.string(),
  /** Fee in atomic units, as a decimal string. Absent for incoming. */
  fee: z.string().optional(),
  /** True when this transaction paid out of the wallet. */
  outgoing: z.boolean(),
  /** Unix seconds. Absent while unconfirmed. */
  timestamp: z.number().optional(),
  /** Block height. Absent while unconfirmed. */
  height: z.number().optional(),
  /** Whether the transaction has confirmed. */
  confirmed: z.boolean(),
});

export type MoneroTxSummary = z.infer<typeof MoneroTxSummarySchema>;

/**
 * The cached view of wallet state.
 *
 * Written after each successful sync. Everything here is *derived* — losing it
 * costs a resync, never funds.
 */
export const MoneroWalletStateSchema = z.object({
  /** Primary address (account 0, subaddress 0). */
  address: z.string(),
  /** Total balance in atomic units, as a decimal string. */
  balance: z.string(),
  /** Spendable (unlocked) balance in atomic units, as a decimal string. */
  unlockedBalance: z.string(),
  /** Wallet's synced height at the time of the snapshot. */
  syncedHeight: z.number(),
  /** Chain height the node reported at the time of the snapshot. */
  daemonHeight: z.number().optional(),
  /** Unix milliseconds when this snapshot was taken. */
  updatedAt: z.number(),
  /** Most recent transactions, newest first. Capped — see `MAX_CACHED_TXS`. */
  txs: z.array(MoneroTxSummarySchema).default([]),
});

export type MoneroWalletState = z.infer<typeof MoneroWalletStateSchema>;

/**
 * The full encrypted record.
 *
 * `seed` is the 25-word Monero mnemonic. We store the mnemonic rather than raw
 * private keys because it's what the user can write down, what every other
 * wallet imports, and what `monero-ts` wants back on restore.
 */
export const MoneroWalletRecordSchema = z.object({
  version: z.number(),
  /** 25-word Monero mnemonic seed. */
  seed: z.string(),
  /**
   * Whether the seed is protected by a passphrase (wallet2's `seed_offset`).
   *
   * The passphrase itself is **never** stored — that would defeat its entire
   * purpose, since it exists to be something the encrypted blob doesn't
   * contain. We record only that one is required, so the UI knows to prompt
   * for it when restoring on another device.
   */
  hasPassphrase: z.boolean().default(false),
  /**
   * Random password encrypting the `.keys` blob held in IndexedDB.
   *
   * The user never sees or types this — it's generated once at wallet
   * creation, exactly as Cake Wallet and Stack Wallet do (both generate a
   * random wallet-file password and keep it in platform secure storage). Here
   * the NIP-44-encrypted record plays the role of secure storage, which means
   * the locally-cached blob is useless on its own: reopening it requires a
   * record only the user's Nostr key can decrypt.
   */
  cachePassword: z.string(),
  /** Block height to begin scanning from. */
  restoreHeight: z.number(),
  /** Primary address. Denormalized so the UI can render before wasm loads. */
  address: z.string(),
  /** Unix milliseconds the wallet was created or first restored. */
  createdAt: z.number(),
  /** Cached state from the last successful sync. */
  state: MoneroWalletStateSchema.optional(),
});

export type MoneroWalletRecord = z.infer<typeof MoneroWalletRecordSchema>;

/**
 * Maximum transactions kept in the cached summary.
 *
 * The record has to stay comfortably inside a relay's event-size limit after
 * NIP-44 encryption and base64. Fifty transactions is roughly 8 KB of JSON —
 * far more than the wallet page shows at once, and an order of magnitude below
 * the tightest common relay cap.
 */
export const MAX_CACHED_TXS = 50;

/** Build the `d` tag for the wallet record. */
export function moneroRecordDTag(appId: string): string {
  return `${appId}/${MONERO_RECORD_D_SUFFIX}`;
}

/**
 * Parse a decrypted record, returning `null` when it doesn't validate.
 *
 * A malformed record is treated as "no wallet" rather than being repaired.
 * Guessing at partially-corrupt key material risks deriving the wrong wallet
 * and showing a zero balance for funds that are actually fine — better to
 * surface nothing and let the user restore from their seed.
 */
export function parseMoneroRecord(json: unknown): MoneroWalletRecord | null {
  const result = MoneroWalletRecordSchema.safeParse(json);
  if (!result.success) {
    console.warn('Monero wallet record failed validation:', result.error.issues);
    return null;
  }
  if (result.data.version > MONERO_RECORD_VERSION) {
    console.warn(
      `Monero wallet record is version ${result.data.version}; this client understands ${MONERO_RECORD_VERSION}.`,
    );
  }
  return result.data;
}

/**
 * Whether two snapshots differ in a way worth publishing a new record for.
 *
 * Every write here is a signed kind-30078 event: a relay round-trip, and on a
 * bunker or extension login a signer round-trip too. The background sync reads
 * state whenever wallet2 reports a change, and `syncedHeight` and `updatedAt`
 * move with every block, so comparing whole snapshots would republish the
 * record every couple of minutes for the rest of the session and gain nothing.
 *
 * What the snapshot exists for is showing a balance and a history instantly on
 * a cold start, so only those fields are compared. A height that lags behind
 * the chain costs the "N blocks behind" label some accuracy until the next
 * real change, which is a much better trade than the traffic.
 */
export function isStateMateriallyDifferent(
  previous: MoneroWalletState | null | undefined,
  next: MoneroWalletState,
): boolean {
  if (!previous) return true;

  if (
    previous.address !== next.address ||
    previous.balance !== next.balance ||
    previous.unlockedBalance !== next.unlockedBalance ||
    previous.txs.length !== next.txs.length
  ) {
    return true;
  }

  // Confirmation flips matter: "Pending" becoming a date is a visible change
  // even when the balance is untouched.
  return previous.txs.some((tx, i) => {
    const other = next.txs[i];
    return !other || tx.hash !== other.hash || tx.confirmed !== other.confirmed;
  });
}

/** Trim a transaction list to the cached maximum, newest first. */
export function trimTxSummaries(txs: MoneroTxSummary[]): MoneroTxSummary[] {
  return [...txs]
    .sort((a, b) => (b.timestamp ?? Number.MAX_SAFE_INTEGER) - (a.timestamp ?? Number.MAX_SAFE_INTEGER))
    .slice(0, MAX_CACHED_TXS);
}
