import { describe, it, expect } from 'vitest';

import { hexToBase36, parseNsiteSubdomain } from './nsiteSubdomain';

const PUBKEY = 'f'.repeat(64);

describe('parseNsiteSubdomain', () => {
  it('round-trips a named site subdomain', () => {
    expect(parseNsiteSubdomain(`${hexToBase36(PUBKEY)}blog`)).toEqual({
      kind: 35128,
      pubkey: PUBKEY,
      identifier: 'blog',
    });
  });

  it('rejects base36 values too large for 32 bytes', () => {
    const tooBig = 'z'.repeat(50);
    expect(parseNsiteSubdomain(`${tooBig}blog`)).toBeNull();
    expect(parseNsiteSubdomain(`v${tooBig}`)).toBeNull();
  });
});
