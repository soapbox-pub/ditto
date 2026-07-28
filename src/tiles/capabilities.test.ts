import { describe, it, expect } from 'vitest';
import { sortCapabilities, CAPABILITY_RANK } from './capabilities';
import type { Capability } from '@soapbox.pub/nostr-canvas';

describe('sortCapabilities', () => {
  it('sorts a shuffled list into rank order', () => {
    const shuffled: Capability[] = [
      'navigate',
      'bitcoin-sign-psbt',
      'fetch',
      'publish-event',
      'nip44-encrypt',
      'nip44-decrypt',
      'feed-action',
      'get-pubkey',
    ];
    const sorted = sortCapabilities(shuffled);
    expect(sorted).toEqual(CAPABILITY_RANK);
  });

  it('handles an empty list', () => {
    expect(sortCapabilities([])).toEqual([]);
  });

  it('places unknown capabilities at the end (stable)', () => {
    const allCaps = [...CAPABILITY_RANK] as string[];
    const perms = ['unknown-a' as Capability, 'unknown-b' as Capability, ...CAPABILITY_RANK];
    const sorted = sortCapabilities(perms);
    // Known capabilities come first in rank order
    expect(sorted.slice(0, allCaps.length)).toEqual(CAPABILITY_RANK);
    // Unknown capabilities follow, preserving original order
    expect(sorted.slice(allCaps.length)).toEqual(['unknown-a', 'unknown-b']);
  });

  it('does not mutate the input array', () => {
    const input: Capability[] = ['navigate', 'fetch', 'get-pubkey'];
    const copy = [...input];
    sortCapabilities(input);
    expect(input).toEqual(copy);
  });

  it('returns a new array (not the same reference)', () => {
    const input: Capability[] = ['fetch', 'navigate'];
    const result = sortCapabilities(input);
    expect(result).not.toBe(input);
  });

  it('handles already-sorted lists idempotently', () => {
    const sorted = sortCapabilities(CAPABILITY_RANK as readonly Capability[]);
    expect(sorted).toEqual(CAPABILITY_RANK);
  });
});
