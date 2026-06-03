import type { NostrEvent } from '@nostrify/nostrify';

import { validateBitcoinAddress } from '@/lib/bitcoin';
import { getCountryInfo } from '@/lib/countries';

/**
 * Addressable kind number for fundraising campaigns (kind 33863).
 *
 * Campaigns are self-authored — the event author owns the wallet
 * declared in the `w` tag and is the sole beneficiary of donations.
 * There is no recipient list, no split logic, and no on-behalf-of
 * authorship. See `NIP.md` for the full spec.
 */
export const CAMPAIGN_KIND = 33863;

/**
 * Two ways a campaign can accept donations, distinguished by the `w`
 * tag's bech32(m) prefix:
 *
 * - **`onchain`** — the wallet is a public mainnet on-chain bech32(m)
 *   address (`bc1q…` segwit v0 or `bc1p…` Taproot). Donations are
 *   traceable in principle.
 * - **`sp`** — the wallet is a BIP-352 silent-payment code (`sp1…`).
 *   Donations are unlinkable by design; aggregate donation UI MUST be
 *   hidden and clients MUST NOT publish donation receipts.
 */
export type CampaignWalletMode = 'onchain' | 'sp';

/** Parsed wallet endpoint declared by a campaign's `w` tag. */
export interface CampaignWallet {
  /** Raw bech32(m) string as it appears in the `w` tag. */
  value: string;
  /** Mode derived from the prefix. */
  mode: CampaignWalletMode;
}

/**
 * The full set of wallet endpoints declared by a campaign. At most one
 * endpoint per mode is allowed; at least one mode must be present.
 */
export interface CampaignWallets {
  onchain?: CampaignWallet;
  sp?: CampaignWallet;
}

/** A fully-parsed campaign event with everything the UI needs. */
export interface ParsedCampaign {
  /** The original event. */
  event: NostrEvent;
  /** Campaign creator's hex pubkey (the beneficiary). */
  pubkey: string;
  /** The campaign's `d` tag (slug). */
  identifier: string;
  /** Addressable coordinate `33863:<pubkey>:<d>`. */
  aTag: string;
  /** Campaign title. */
  title: string;
  /** Short tagline. */
  summary: string;
  /** Markdown story (the event content). */
  story: string;
  /** Banner image URL (validated as https://); sanitize at the render site. */
  banner?: string;
  /** Bitcoin wallet endpoints (at least one is present). */
  wallets: CampaignWallets;
  /** Fundraising goal in **integer US Dollars**, or `undefined`. */
  goalUsd?: number;
  /** Deadline (Unix seconds), or `undefined`. */
  deadline?: number;
  /** ISO 3166-1 alpha-2 country code parsed from a NIP-73 `i` tag. */
  countryCode?: string;
  /** Created-at from the event. */
  createdAt: number;
}

/** Returns the first value of a tag, or `undefined`. */
function getTag(event: NostrEvent, name: string): string | undefined {
  return event.tags.find(([n]) => n === name)?.[1];
}

/** Returns all values of a tag in declaration order. */
function getTagValues(event: NostrEvent, name: string): string[] {
  const values: string[] = [];
  for (const tag of event.tags) {
    if (tag[0] !== name) continue;
    if (typeof tag[1] !== 'string') continue;
    values.push(tag[1]);
  }
  return values;
}

/** Parses a positive integer string. Returns `undefined` on failure. */
function parsePositiveInt(s: string | undefined): number | undefined {
  if (!s) return undefined;
  const n = Number(s);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) return undefined;
  return n;
}

/**
 * Extract the ISO 3166-1 alpha-2 country code from the first NIP-73
 * `i` tag of the form `iso3166:XX`. Anything else (subdivisions like
 * `iso3166-2:US-CA`, other schemes) is ignored.
 */
function getCountryCode(event: NostrEvent): string | undefined {
  for (const [name, value] of event.tags) {
    if (name !== 'i' || typeof value !== 'string') continue;
    const m = /^iso3166:([A-Za-z]{2})$/.exec(value);
    if (m) {
      const code = m[1].toUpperCase();
      // Only return the code if Ditto's COUNTRIES table knows about it,
      // otherwise we'd render an unrecognized two-letter blob.
      if (getCountryInfo(code)) return code;
    }
  }
  return undefined;
}

/**
 * Parse a single campaign wallet endpoint string. Returns `null` if the
 * value is missing, malformed, on a non-mainnet network, or fails
 * bech32(m) checksum validation.
 *
 * - `bc1q…` / `bc1p…` → mainnet on-chain (full bech32(m) checksum check).
 * - `sp1…` → BIP-352 silent-payment code; we accept the shape and let
 *   the donor's wallet validate the checksum when it derives outputs.
 *
 * Other prefixes (`tb1…`, `bcrt1…`, `tsp1…`, lightning invoices, etc.)
 * are rejected.
 */
export function parseCampaignWallet(value: string | undefined): CampaignWallet | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (/^bc1[qp]/i.test(trimmed)) {
    if (!validateBitcoinAddress(trimmed)) return null;
    return { value: trimmed, mode: 'onchain' };
  }

  if (/^sp1[02-9ac-hj-np-z]+$/i.test(trimmed)) {
    return { value: trimmed, mode: 'sp' };
  }

  return null;
}

/**
 * Parse all of a campaign's `w` tag values into a {@link CampaignWallets}
 * struct. Returns `null` if the list is empty, any individual value is
 * invalid, or more than one endpoint of the same mode is declared (the
 * spec permits at most one per mode).
 */
export function parseCampaignWallets(values: string[]): CampaignWallets | null {
  if (values.length === 0) return null;
  const wallets: CampaignWallets = {};
  for (const raw of values) {
    const parsed = parseCampaignWallet(raw);
    if (!parsed) return null;
    if (wallets[parsed.mode]) return null;
    wallets[parsed.mode] = parsed;
  }
  if (!wallets.onchain && !wallets.sp) return null;
  return wallets;
}

/**
 * Parse a kind 33863 event into a strongly-typed {@link ParsedCampaign}.
 * Returns `null` when the event is missing a required field (`d`,
 * `title`, or a valid `w` wallet endpoint) — the UI treats those as
 * unrenderable and silently drops them.
 */
export function parseCampaign(event: NostrEvent): ParsedCampaign | null {
  if (event.kind !== CAMPAIGN_KIND) return null;

  const identifier = getTag(event, 'd');
  const title = getTag(event, 'title');
  if (!identifier || !title || !title.trim()) return null;

  const wallets = parseCampaignWallets(getTagValues(event, 'w'));
  if (!wallets) return null;

  // Banner — only accept https URLs at parse time. The render site
  // still runs the URL through `sanitizeUrl()` before use.
  const rawBanner = getTag(event, 'banner');
  const banner = rawBanner && /^https:\/\//i.test(rawBanner) ? rawBanner : undefined;

  return {
    event,
    pubkey: event.pubkey,
    identifier,
    aTag: `${CAMPAIGN_KIND}:${event.pubkey}:${identifier}`,
    title: title.trim(),
    summary: getTag(event, 'summary')?.trim() ?? '',
    story: event.content,
    banner,
    wallets,
    goalUsd: parsePositiveInt(getTag(event, 'goal')),
    deadline: parsePositiveInt(getTag(event, 'deadline')),
    countryCode: getCountryCode(event),
    createdAt: event.created_at,
  };
}

/**
 * Human display for a campaign's country code, including the flag
 * emoji. Returns `undefined` when the campaign has no country tag.
 */
export function getCampaignCountryLabel(campaign: ParsedCampaign): string | undefined {
  if (!campaign.countryCode) return undefined;
  const info = getCountryInfo(campaign.countryCode);
  if (!info) return undefined;
  return `${info.flag} ${info.name}`;
}

/**
 * Format a deadline timestamp as a relative label like "Ends today",
 * "12 days left", "3 mo left", or "Ended". Returns `null` for missing
 * deadlines so callers can decide whether to render the row at all.
 */
export function formatCampaignDeadline(
  unixSeconds: number | undefined,
): { label: string; isPast: boolean } | null {
  if (!unixSeconds) return null;
  const now = Math.floor(Date.now() / 1000);
  const diff = unixSeconds - now;
  if (diff <= 0) return { label: 'Ended', isPast: true };
  const days = Math.ceil(diff / 86_400);
  if (days <= 1) return { label: 'Ends today', isPast: false };
  if (days < 30) return { label: `${days} days left`, isPast: false };
  const months = Math.round(days / 30);
  return { label: `${months} mo left`, isPast: false };
}

/**
 * Format an integer USD goal as `$1,234`. Returns `$0` for invalid /
 * non-positive values; callers should usually omit the goal row in
 * that case rather than render `$0`.
 */
export function formatUsdGoal(usd: number): string {
  if (!Number.isFinite(usd) || usd <= 0) return '$0';
  return `$${Math.floor(usd).toLocaleString()}`;
}

/**
 * Convert a sats amount to USD using a live BTC/USD price. Returns
 * `undefined` when the price isn't available — callers should fall
 * back to the sats representation rather than rendering `$0`.
 */
export function satsToUsdNumber(sats: number, btcPrice: number | undefined): number | undefined {
  if (!btcPrice || !Number.isFinite(btcPrice) || btcPrice <= 0) return undefined;
  return (sats / 100_000_000) * btcPrice;
}

/**
 * Compact "raised" amount for a campaign card. Prefers a USD figure
 * when a BTC price is available, falling back to a sats label
 * otherwise. Mirrors Agora's `formatCampaignAmount`.
 */
export function formatCampaignRaised(sats: number, btcPrice: number | undefined): string {
  if (sats <= 0) return '$0';
  const usd = satsToUsdNumber(sats, btcPrice);
  if (usd !== undefined) {
    if (usd >= 1) return `$${Math.round(usd).toLocaleString()}`;
    // Tiny donations: keep two decimals so a $0.50 tip doesn't read $0.
    return `$${usd.toFixed(2)}`;
  }
  return `${sats.toLocaleString()} sats`;
}
