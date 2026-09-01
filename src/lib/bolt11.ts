/**
 * BOLT11 lightning invoice decoding.
 *
 * This is an *authentication* decoder, not a display heuristic: before any
 * wallet is asked to pay an invoice we have to know exactly what that invoice
 * commits to. The regex in `LightningInvoiceCard` reads the human-readable
 * part of a string that is assumed to already be an invoice — it will happily
 * report an amount for a string that is not a valid invoice at all, and it
 * cannot see the tagged fields. Use {@link decodeBolt11} for anything that
 * moves money.
 *
 * Built on `@scure/base` + `@noble/hashes`, both already in the entry bundle
 * via `nostr-tools`, so this adds no new dependency.
 *
 * Reference: BOLT 11, "Invoice Protocol for Lightning Payments".
 */
import { bech32 } from '@scure/base';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';

/** A decoded BOLT11 invoice. Only the fields we need are surfaced. */
export interface DecodedInvoice {
  /**
   * Amount in millisatoshis, or `null` when the invoice is *amountless* —
   * meaning the payer or the payee chooses the sum. Never pay an amountless
   * invoice on the user's behalf.
   */
  amountMsat: number | null;
  /** Network prefix from the human-readable part: `bc`, `tb`, `bcrt`, `sb`. */
  network: string;
  /** Hex 32-byte payment hash (`p` field). */
  paymentHash?: string;
  /** Hex 32-byte description hash (`h` field), if the invoice carries one. */
  descriptionHash?: string;
  /** Plain-text description (`d` field), if the invoice carries one. */
  description?: string;
  /** Hex 33-byte payee node id (`n` field), if the invoice carries one. */
  payee?: string;
  /** Invoice creation time, in Unix seconds. */
  timestamp: number;
  /** Seconds after {@link timestamp} that the invoice expires. */
  expiry: number;
}

/** Millisatoshis in one bitcoin. */
const MSAT_PER_BTC = 100_000_000_000n;

/**
 * BOLT11 amount multipliers, as the divisor applied to {@link MSAT_PER_BTC}.
 * `p` (pico) divides to 1/10 msat, so pico amounts must be a multiple of 10.
 */
const MULTIPLIERS: Record<string, bigint> = {
  m: 1_000n,
  u: 1_000_000n,
  n: 1_000_000_000n,
  p: 1_000_000_000_000n,
};

/** `ln` + network + optional amount. Longer prefixes first (`bcrt` vs `bc`). */
const HRP_RE = /^ln(bcrt|bc|tbs|tb|sb)(?:(\d+)([munp])?)?$/;

/** BOLT11 tagged-field types, as bech32 word values. */
const TAG_PAYMENT_HASH = 1; // 'p'
const TAG_DESCRIPTION = 13; // 'd'
const TAG_PAYEE = 19; // 'n'
const TAG_DESCRIPTION_HASH = 23; // 'h'
const TAG_EXPIRY = 6; // 'x'

/** Words occupied by the trailing signature (65 bytes = 520 bits). */
const SIGNATURE_WORDS = 104;
/** Words occupied by the leading timestamp (35 bits). */
const TIMESTAMP_WORDS = 7;

/** BOLT11's default expiry when no `x` field is present. */
const DEFAULT_EXPIRY = 3600;

/**
 * Pack 5-bit bech32 words into bytes, discarding any trailing bits that do
 * not complete a byte. BOLT11 fields are not all byte-aligned (a 32-byte hash
 * occupies 52 words = 260 bits), so `bech32.fromWords` — which rejects
 * leftover bits — cannot be used here.
 */
function wordsToBytes(words: number[]): Uint8Array {
  const out = new Uint8Array(Math.floor((words.length * 5) / 8));
  let acc = 0;
  let bits = 0;
  let i = 0;
  for (const word of words) {
    acc = (acc << 5) | word;
    bits += 5;
    while (bits >= 8) {
      bits -= 8;
      out[i++] = (acc >> bits) & 0xff;
    }
  }
  return out;
}

/** Read a big-endian integer out of 5-bit words. */
function wordsToInt(words: number[]): number {
  let value = 0;
  for (const word of words) {
    value = value * 32 + word;
  }
  return value;
}

/** Parse the amount out of a BOLT11 human-readable part, in millisatoshis. */
function parseHrpAmount(digits: string | undefined, multiplier: string | undefined): number | null {
  if (!digits) return null;

  const value = BigInt(digits);
  const divisor = multiplier ? MULTIPLIERS[multiplier] : 1n;
  const numerator = value * MSAT_PER_BTC;

  if (numerator % divisor !== 0n) {
    // Sub-millisatoshi precision. BOLT11 forbids it, and we can't pay it.
    throw new Error('Invalid BOLT11 invoice: amount is not a whole number of millisatoshis');
  }

  const msat = numerator / divisor;
  if (msat > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('Invalid BOLT11 invoice: amount is implausibly large');
  }

  return Number(msat);
}

/**
 * Decode a BOLT11 invoice, verifying its bech32 checksum and structure.
 *
 * Throws on anything that is not a well-formed invoice. The signature is not
 * checked — verifying it would only prove the invoice was signed by whoever
 * the invoice itself names as payee, which tells us nothing we didn't already
 * decide by choosing to talk to that endpoint. What matters to callers is the
 * *amount* and the *description hash*, both of which are covered here.
 */
export function decodeBolt11(invoice: string): DecodedInvoice {
  const trimmed = invoice.trim().replace(/^lightning:/i, '');
  const lowered = trimmed.toLowerCase();

  if (!lowered.startsWith('ln')) {
    throw new Error('Invalid BOLT11 invoice: missing "ln" prefix');
  }

  // `false` disables bech32's 90-character limit, which invoices exceed.
  const { prefix, words } = bech32.decode(lowered as `${Lowercase<string>}1${string}`, false);

  const hrp = HRP_RE.exec(prefix);
  if (!hrp) {
    throw new Error('Invalid BOLT11 invoice: unrecognized prefix');
  }

  const [, network, digits, multiplier] = hrp;
  const amountMsat = parseHrpAmount(digits, multiplier);

  if (words.length < TIMESTAMP_WORDS + SIGNATURE_WORDS) {
    throw new Error('Invalid BOLT11 invoice: truncated');
  }

  const timestamp = wordsToInt(words.slice(0, TIMESTAMP_WORDS));
  const tagged = words.slice(TIMESTAMP_WORDS, words.length - SIGNATURE_WORDS);

  const decoded: DecodedInvoice = { amountMsat, network, timestamp, expiry: DEFAULT_EXPIRY };

  for (let i = 0; i + 3 <= tagged.length;) {
    const type = tagged[i];
    const length = tagged[i + 1] * 32 + tagged[i + 2];
    const start = i + 3;
    const end = start + length;
    if (end > tagged.length) {
      throw new Error('Invalid BOLT11 invoice: tagged field overruns the invoice');
    }
    const data = tagged.slice(start, end);
    i = end;

    switch (type) {
      case TAG_PAYMENT_HASH:
        if (length === 52) decoded.paymentHash = bytesToHex(wordsToBytes(data));
        break;
      case TAG_DESCRIPTION_HASH:
        if (length === 52) decoded.descriptionHash = bytesToHex(wordsToBytes(data));
        break;
      case TAG_PAYEE:
        if (length === 53) decoded.payee = bytesToHex(wordsToBytes(data));
        break;
      case TAG_DESCRIPTION:
        decoded.description = new TextDecoder().decode(wordsToBytes(data));
        break;
      case TAG_EXPIRY:
        decoded.expiry = wordsToInt(data);
        break;
    }
  }

  return decoded;
}

/**
 * Assert that `invoice` is payable for exactly `expectedMsat`.
 *
 * LNURL-pay endpoints are chosen by the *recipient*, so the invoice they hand
 * back is attacker-controlled whenever the recipient is hostile. Without this
 * check the recipient — not the sender — decides how much the sender pays.
 *
 * Returns the decoded invoice so callers can report the amount they actually
 * paid rather than the one they asked for.
 */
export function assertInvoiceAmount(
  invoice: string,
  expectedMsat: number,
): DecodedInvoice & { amountMsat: number } {
  let decoded: DecodedInvoice;
  try {
    decoded = decodeBolt11(invoice);
  } catch (error) {
    throw new Error(
      `Lightning service returned an unreadable invoice: ${
        error instanceof Error ? error.message : 'unknown error'
      }`,
    );
  }

  if (decoded.amountMsat === null) {
    throw new Error(
      'Lightning service returned an invoice with no amount, which would let it charge any sum. Payment cancelled.',
    );
  }

  if (decoded.amountMsat !== expectedMsat) {
    throw new Error(
      `Lightning service returned an invoice for ${Math.round(decoded.amountMsat / 1000)} sats, ` +
        `but ${Math.round(expectedMsat / 1000)} sats was requested. Payment cancelled.`,
    );
  }

  return { ...decoded, amountMsat: decoded.amountMsat };
}

/**
 * Check an invoice's `h` field against the strings it is allowed to commit to.
 *
 * LUD-06 binds the invoice to the LNURL endpoint's `metadata`; NIP-57 replaces
 * that with the zap request JSON. Providers implement one or the other, so any
 * match is accepted. An invoice with no `h` field at all is accepted too —
 * plenty of providers use a plain `d` description — because the amount check
 * is what actually stops an overcharge; this is defence in depth against a
 * substituted invoice on an otherwise honest response.
 */
export function invoiceCommitsTo(decoded: DecodedInvoice, candidates: string[]): boolean {
  if (!decoded.descriptionHash) return true;

  const encoder = new TextEncoder();
  return candidates.some(
    (candidate) => bytesToHex(sha256(encoder.encode(candidate))) === decoded.descriptionHash,
  );
}
