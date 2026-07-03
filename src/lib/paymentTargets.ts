/**
 * NIP-A3 payment targets (kind 10133).
 *
 * A payment target is a `(type, authority)` pair declared in a `payto` tag of
 * a replaceable kind 10133 event. Ditto uses the phrase "payment targets" in
 * code and "Accept Donations" in the UI.
 *
 * Ditto restricts the editable set to a curated allowlist of recognized
 * payment types (see {@link PAYMENT_METHODS}). Each method knows how to:
 *   - validate an `authority` (address / handle / lightning address);
 *   - build a clickable native URI (e.g. `monero:<addr>`), preferring the
 *     native scheme over RFC-8905 `payto:` wherever one exists;
 *   - render itself with an icon + label.
 *
 * Bitcoin and Lightning are "native" methods that Ditto already supports with
 * a rich purpose-built UI; their payment-target entries override the values
 * Ditto would otherwise derive (a Taproot address from the pubkey for Bitcoin,
 * the kind-0 `lud16` for Lightning) but reuse the existing flows rather than a
 * generic clickable button.
 *
 * @see https://github.com/ATXMJ/nips A3.md
 */
import type { NostrEvent } from '@nostrify/nostrify';

import { validateBitcoinAddress } from '@/lib/bitcoinAddress';
import { isSilentPaymentAddress, validateSilentPaymentAddress } from '@/lib/silentPaymentsCore';

/** Replaceable kind for NIP-A3 payment targets. */
export const PAYMENT_TARGETS_KIND = 10133;

/**
 * Curated payment-target types Ditto knows how to validate and render. The
 * NIP-A3 type string is always lowercase; we normalize on parse.
 */
export type PaymentTargetType =
  | 'bitcoin'
  | 'lightning'
  | 'monero'
  | 'ethereum'
  | 'nano'
  | 'cashme'
  | 'venmo'
  | 'revolut';

/** A parsed payment target — a single `payto` tag. */
export interface PaymentTarget {
  /** Normalized lowercase payment type. */
  type: PaymentTargetType;
  /** The address / handle / lightning address. */
  authority: string;
}

/**
 * How a payment target is consumed in the zap dialog.
 *
 * - `bitcoin` / `lightning` are **native**: Ditto already has dedicated,
 *   icon-rich flows for them. A payment target of these types overrides the
 *   value Ditto would derive, but the UI/UX is preserved (no extra clickable
 *   button).
 * - `generic` methods (Monero, Ethereum, …) render a QR code, a copyable
 *   address, and a clickable native-URI button.
 */
export type PaymentMethodKind = 'bitcoin' | 'lightning' | 'generic';

/** Static metadata + behavior for a recognized payment type. */
export interface PaymentMethodDef {
  type: PaymentTargetType;
  /** UI label, e.g. "Bitcoin", "Monero". */
  label: string;
  /** Short ticker, e.g. "BTC", "XMR". */
  short: string;
  /** Currency symbol from the NIP-A3 table. */
  symbol: string;
  /** Drives how the zap dialog renders the method. */
  kind: PaymentMethodKind;
  /**
   * Validate an `authority` string for this type. Returns `true` when the
   * value is well-formed enough to store/render.
   */
  validate: (authority: string) => boolean;
  /**
   * Build the preferred clickable URI for a `generic` method (e.g.
   * `monero:<addr>`, `ethereum:<addr>`). Returns `undefined` when no native
   * scheme is appropriate. Native methods (bitcoin/lightning) return
   * `undefined` — they don't use a generic button.
   */
  uri: (authority: string) => string | undefined;
  /** Placeholder shown in the editor input. */
  placeholder: string;
}

/** Loose lightning-address / LNURL shape check. */
function isLightningAuthority(s: string): boolean {
  const v = s.trim();
  if (!v) return false;
  // lud16 lightning address: user@domain.tld
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return true;
  // lud06 LNURL bech32 (lnurl1…) — case-insensitive, alnum.
  if (/^lnurl1[02-9ac-hj-np-z]+$/i.test(v)) return true;
  return false;
}

/** Bitcoin authority: a mainnet on-chain address OR a BIP-352 silent payment code. */
function isBitcoinAuthority(s: string): boolean {
  const v = s.trim();
  if (!v) return false;
  if (isSilentPaymentAddress(v)) return validateSilentPaymentAddress(v);
  return validateBitcoinAddress(v);
}

/** Monero standard / integrated / subaddress: base58, 95/106 chars, starts 4/8. */
function isMoneroAuthority(s: string): boolean {
  const v = s.trim();
  return /^[48][0-9A-Za-z]{94,105}$/.test(v);
}

/** EVM hex address. */
function isEthereumAuthority(s: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(s.trim());
}

/** Nano address: `nano_` + 60 base32 chars. */
function isNanoAuthority(s: string): boolean {
  return /^(nano|xrb)_[13][13-9a-km-uw-z]{59}$/.test(s.trim());
}

/** Loose handle/username check for custodial apps (Cash App, Venmo, Revolut). */
function isHandle(s: string): boolean {
  const v = s.trim().replace(/^[$@]/, '');
  return /^[A-Za-z0-9_.-]{1,64}$/.test(v);
}

/**
 * Registry of recognized payment methods, keyed by type. Order here defines
 * the order methods appear in the editor and the zap-dialog dropdown.
 */
export const PAYMENT_METHODS: Record<PaymentTargetType, PaymentMethodDef> = {
  bitcoin: {
    type: 'bitcoin',
    label: 'Bitcoin',
    short: 'BTC',
    symbol: '₿',
    kind: 'bitcoin',
    validate: isBitcoinAuthority,
    uri: () => undefined,
    placeholder: 'bc1… or sp1…',
  },
  lightning: {
    type: 'lightning',
    label: 'Lightning',
    short: 'LBTC',
    symbol: '⚡',
    kind: 'lightning',
    validate: isLightningAuthority,
    uri: () => undefined,
    placeholder: 'you@walletofsatoshi.com',
  },
  monero: {
    type: 'monero',
    label: 'Monero',
    short: 'XMR',
    symbol: 'ɱ',
    kind: 'generic',
    validate: isMoneroAuthority,
    uri: (a) => `monero:${a.trim()}`,
    placeholder: '4… (Monero address)',
  },
  ethereum: {
    type: 'ethereum',
    label: 'Ethereum',
    short: 'ETH',
    symbol: 'Ξ',
    kind: 'generic',
    validate: isEthereumAuthority,
    uri: (a) => `ethereum:${a.trim()}`,
    placeholder: '0x… (Ethereum address)',
  },
  nano: {
    type: 'nano',
    label: 'Nano',
    short: 'XNO',
    symbol: 'Ӿ',
    kind: 'generic',
    validate: isNanoAuthority,
    uri: (a) => `nano:${a.trim()}`,
    placeholder: 'nano_… (Nano address)',
  },
  cashme: {
    type: 'cashme',
    label: 'Cash App',
    short: 'Cash App',
    symbol: '$',
    kind: 'generic',
    validate: isHandle,
    // Cash App $cashtags resolve at cash.app/$handle — no native scheme.
    uri: (a) => `https://cash.app/$${a.trim().replace(/^\$/, '')}`,
    placeholder: '$cashtag',
  },
  venmo: {
    type: 'venmo',
    label: 'Venmo',
    short: 'Venmo',
    symbol: '$',
    kind: 'generic',
    validate: isHandle,
    uri: (a) => `https://venmo.com/u/${a.trim().replace(/^@/, '')}`,
    placeholder: '@username',
  },
  revolut: {
    type: 'revolut',
    label: 'Revolut',
    short: 'Revolut',
    symbol: '£',
    kind: 'generic',
    validate: isHandle,
    uri: (a) => `https://revolut.me/${a.trim().replace(/^@/, '')}`,
    placeholder: 'username',
  },
};

/** Ordered list of recognized method definitions. */
export const PAYMENT_METHOD_LIST: PaymentMethodDef[] = Object.values(PAYMENT_METHODS);

/** Narrow a raw type string to a recognized {@link PaymentTargetType}. */
export function isRecognizedPaymentType(type: string): type is PaymentTargetType {
  return Object.prototype.hasOwnProperty.call(PAYMENT_METHODS, type);
}

/** Look up a recognized method definition, or `undefined`. */
export function getPaymentMethod(type: string): PaymentMethodDef | undefined {
  return isRecognizedPaymentType(type) ? PAYMENT_METHODS[type] : undefined;
}

/**
 * Parse a kind 10133 event's `payto` tags into validated payment targets.
 *
 * Per NIP-A3 a `payto` tag is `["payto", "<type>", "<authority>", …]`.
 * Elements beyond index 2 are reserved and ignored for forward compatibility.
 *
 * Ditto:
 *   - normalizes `type` to lowercase;
 *   - drops unrecognized types (curated allowlist);
 *   - drops entries whose authority fails the type's validator;
 *   - keeps only the **first** target of each type (one per type; the earliest
 *     declared wins), so a single method maps to a single target.
 *
 * Returns targets in {@link PAYMENT_METHOD_LIST} order for stable rendering.
 */
export function parsePaymentTargets(event: NostrEvent | null | undefined): PaymentTarget[] {
  if (!event || event.kind !== PAYMENT_TARGETS_KIND) return [];

  const byType = new Map<PaymentTargetType, PaymentTarget>();

  for (const tag of event.tags) {
    if (tag[0] !== 'payto') continue;
    const rawType = typeof tag[1] === 'string' ? tag[1].trim().toLowerCase() : '';
    const authority = typeof tag[2] === 'string' ? tag[2].trim() : '';
    if (!rawType || !authority) continue;
    if (!isRecognizedPaymentType(rawType)) continue;
    if (byType.has(rawType)) continue; // first one wins
    if (!PAYMENT_METHODS[rawType].validate(authority)) continue;
    byType.set(rawType, { type: rawType, authority });
  }

  return PAYMENT_METHOD_LIST.flatMap((m) => {
    const target = byType.get(m.type);
    return target ? [target] : [];
  });
}

/**
 * Serialize a list of payment targets into kind 10133 `payto` tags. Keeps at
 * most one target per type and only includes valid entries, in registry order.
 */
export function paymentTargetsToTags(targets: PaymentTarget[]): string[][] {
  const byType = new Map<PaymentTargetType, string>();
  for (const t of targets) {
    if (!isRecognizedPaymentType(t.type)) continue;
    const authority = t.authority.trim();
    if (!authority) continue;
    if (!PAYMENT_METHODS[t.type].validate(authority)) continue;
    if (byType.has(t.type)) continue;
    byType.set(t.type, authority);
  }

  return PAYMENT_METHOD_LIST.flatMap((m) => {
    const authority = byType.get(m.type);
    return authority ? [['payto', m.type, authority]] : [];
  });
}

/** Find the bitcoin payment target (if any) in a parsed list. */
export function findBitcoinTarget(targets: PaymentTarget[]): PaymentTarget | undefined {
  return targets.find((t) => t.type === 'bitcoin');
}

/** Find the lightning payment target (if any) in a parsed list. */
export function findLightningTarget(targets: PaymentTarget[]): PaymentTarget | undefined {
  return targets.find((t) => t.type === 'lightning');
}

/** Whether a bitcoin authority is a BIP-352 silent-payment code (`sp1…`). */
export function isSilentPaymentLike(authority: string): boolean {
  return isSilentPaymentAddress(authority.trim());
}
