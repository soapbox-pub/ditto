import type { Capability } from '@soapbox.pub/nostr-canvas';

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
