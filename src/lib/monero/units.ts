/**
 * Monero amount and address helpers.
 *
 * Monero denominates everything in **atomic units** (colloquially "piconero"):
 * 1 XMR = 1e12 atomic units. That's four more decimal places than Bitcoin's
 * satoshi, and well past `Number.MAX_SAFE_INTEGER` for realistic balances, so
 * every amount that crosses this module is a `bigint`. Formatting to a string
 * is the only place a decimal representation exists.
 *
 * `monero-ts` also speaks `bigint` for balances and `MoneroTxConfig.amount`,
 * so no conversion is needed at that boundary.
 */

/** Atomic units in one XMR (10^12). */
export const ATOMIC_UNITS_PER_XMR = 1_000_000_000_000n;

/** Decimal places in a whole XMR. */
export const XMR_DECIMALS = 12;

/**
 * Format atomic units as an XMR decimal string.
 *
 * Monero's own tooling shows a variable number of decimals — trailing zeros
 * are trimmed — but always at least `minDecimals`, so a column of balances
 * stays visually aligned. Exact: no float arithmetic is involved.
 */
export function formatXMR(
  atomicUnits: bigint,
  { maxDecimals = 6, minDecimals = 4 }: { maxDecimals?: number; minDecimals?: number } = {},
): string {
  const negative = atomicUnits < 0n;
  const abs = negative ? -atomicUnits : atomicUnits;

  const whole = abs / ATOMIC_UNITS_PER_XMR;
  const fraction = abs % ATOMIC_UNITS_PER_XMR;

  // Left-pad to the full 12 places, then cut to `maxDecimals`.
  const fractionStr = fraction.toString().padStart(XMR_DECIMALS, '0').slice(0, maxDecimals);

  // Trim trailing zeros, but never below `minDecimals`.
  let trimmed = fractionStr.replace(/0+$/, '');
  if (trimmed.length < minDecimals) trimmed = fractionStr.slice(0, minDecimals);

  const sign = negative ? '-' : '';
  return trimmed ? `${sign}${whole}.${trimmed}` : `${sign}${whole}`;
}

/**
 * Parse a user-entered XMR decimal string into atomic units.
 *
 * Returns `null` for anything unparseable. Extra decimal places beyond 12 are
 * rejected rather than silently rounded — quietly dropping precision from an
 * amount the user typed is how you send the wrong amount.
 */
export function parseXMR(input: string): bigint | null {
  const trimmed = input.trim().replace(/,/g, '');
  if (!trimmed) return null;
  if (!/^\d*\.?\d*$/.test(trimmed)) return null;
  if (trimmed === '.' || trimmed === '') return null;

  const [wholePart = '0', fractionPart = ''] = trimmed.split('.');
  if (fractionPart.length > XMR_DECIMALS) return null;

  const padded = fractionPart.padEnd(XMR_DECIMALS, '0');
  try {
    return BigInt(wholePart || '0') * ATOMIC_UNITS_PER_XMR + BigInt(padded || '0');
  } catch {
    return null;
  }
}

/** Convert atomic units to a fiat amount, given a per-XMR price. */
export function atomicToFiat(atomicUnits: bigint, xmrPrice: number): number {
  // Balances are far below 2^53 once divided down to whole XMR, so the
  // Number conversion here is safe for any realistic amount.
  return (Number(atomicUnits) / Number(ATOMIC_UNITS_PER_XMR)) * xmrPrice;
}

/** Convert a fiat amount to atomic units, given a per-XMR price. */
export function fiatToAtomic(fiat: number, xmrPrice: number): bigint {
  if (!xmrPrice || !Number.isFinite(fiat) || fiat < 0) return 0n;
  const xmr = fiat / xmrPrice;
  // Round to the nearest atomic unit via a fixed-point string so we don't
  // inherit binary-float drift in the last places.
  return parseXMR(xmr.toFixed(XMR_DECIMALS)) ?? 0n;
}

/** Format an atomic-unit amount as a localized fiat string. */
export function atomicToUSD(atomicUnits: bigint, xmrPrice: number): string {
  return atomicToFiat(atomicUnits, xmrPrice).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  });
}

/**
 * Validate a Monero address.
 *
 * Shape check only — base58 alphabet, leading byte, and length:
 *
 * | Kind        | Prefix | Length |
 * |-------------|--------|--------|
 * | Standard    | `4`    | 95     |
 * | Subaddress  | `8`    | 95     |
 * | Integrated  | `4`    | 106    |
 *
 * This deliberately mirrors `isMoneroAuthority` in `@/lib/paymentTargets` so a
 * NIP-A3 target and a send-form entry accept exactly the same set. The real
 * checksum verification happens in `monero-ts` (`MoneroUtils.validateAddress`)
 * before a transaction is built; this is the cheap synchronous gate used for
 * input validation, where pulling in the 3 MB wasm module would be absurd.
 */
export function isMoneroAddress(value: string): boolean {
  const v = value.trim();
  return /^[48][0-9A-Za-z]{94}$/.test(v) || /^4[0-9A-Za-z]{105}$/.test(v);
}

/** Whether an address is a 106-character integrated address. */
export function isIntegratedAddress(value: string): boolean {
  return /^4[0-9A-Za-z]{105}$/.test(value.trim());
}

/** Abbreviate a Monero address for display (they're 95+ characters). */
export function truncateAddress(address: string, lead = 12, tail = 8): string {
  if (address.length <= lead + tail + 3) return address;
  return `${address.slice(0, lead)}...${address.slice(-tail)}`;
}

/**
 * Parse a `monero:` URI (loosely modelled on BIP-21, as used by the Monero
 * GUI, Cake, Monerujo and Feather).
 *
 * `monero:<address>?tx_amount=1.5&tx_description=...&recipient_name=...`
 *
 * Returns `null` when the URI isn't a `monero:` URI or carries an address that
 * fails {@link isMoneroAddress}. Unknown query parameters are ignored, per the
 * same forward-compatibility rule NIP-A3 uses for extra tag elements.
 */
export function parseMoneroUri(
  uri: string,
): { address: string; amount?: bigint; description?: string; recipientName?: string } | null {
  const trimmed = uri.trim();
  if (!/^monero:/i.test(trimmed)) return null;

  const withoutScheme = trimmed.slice(trimmed.indexOf(':') + 1);
  const [addressPart, queryPart] = withoutScheme.split('?');
  const address = decodeURIComponent(addressPart ?? '').trim();
  if (!isMoneroAddress(address)) return null;

  const params = new URLSearchParams(queryPart ?? '');
  // `tx_amount` is the Monero convention; `amount` is accepted because some
  // generators emit the BIP-21 spelling.
  const rawAmount = params.get('tx_amount') ?? params.get('amount');
  const amount = rawAmount ? parseXMR(rawAmount) ?? undefined : undefined;

  return {
    address,
    amount,
    description: params.get('tx_description') ?? undefined,
    recipientName: params.get('recipient_name') ?? undefined,
  };
}

/** Build a `monero:` URI for QR codes and native-app handoff. */
export function buildMoneroUri(address: string, amount?: bigint, description?: string): string {
  const params = new URLSearchParams();
  if (amount && amount > 0n) {
    params.set('tx_amount', formatXMR(amount, { maxDecimals: XMR_DECIMALS, minDecimals: 0 }));
  }
  if (description) params.set('tx_description', description);
  const query = params.toString();
  return query ? `monero:${address}?${query}` : `monero:${address}`;
}
