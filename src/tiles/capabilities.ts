import type { Capability } from '@soapbox.pub/nostr-canvas';

/** Plain-English descriptions for each Canvas widget capability. */
export const CAPABILITY_DESCRIPTIONS: Record<Capability, string> = {
  'get-pubkey': 'Can read your public key.',
  'publish-event': 'Can publish Nostr events on your behalf.',
  'nip44-encrypt': 'Can encrypt messages using NIP-44.',
  'nip44-decrypt': 'Can decrypt messages using NIP-44.',
  'bitcoin-sign-psbt': 'Can ask you to sign Bitcoin transactions — always asks each time.',
  'fetch': 'Can make network requests to external servers.',
  'navigate': 'Can open links in your browser.',
  'feed-action': 'Can appear as an action on your feed posts.',
};

/** Capabilities ordered most → least consequential (user-approved). */
export const CAPABILITY_RANK: readonly Capability[] = [
  'bitcoin-sign-psbt',
  'publish-event',
  'nip44-decrypt',
  'nip44-encrypt',
  'fetch',
  'get-pubkey',
  'feed-action',
  'navigate',
];

const RANK_MAP: Record<Capability, number> = Object.fromEntries(
  CAPABILITY_RANK.map((cap, i) => [cap, i]),
) as Record<Capability, number>;

/** Sort capabilities by importance (unknown values last, stable). */
export function sortCapabilities(perms: readonly Capability[]): Capability[] {
  return [...perms].sort((a, b) => {
    const rankA = RANK_MAP[a] ?? Number.MAX_SAFE_INTEGER;
    const rankB = RANK_MAP[b] ?? Number.MAX_SAFE_INTEGER;
    return rankA - rankB;
  });
}
