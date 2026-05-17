import { describe, expect, it } from 'vitest';

import { parseAddr } from './parseAddr';

const PUBKEY = '79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798';

describe('parseAddr', () => {
  it('parses a well-formed addressable coordinate', () => {
    expect(parseAddr(`30009:${PUBKEY}:my-badge`)).toEqual({
      kind: 30009,
      pubkey: PUBKEY,
      identifier: 'my-badge',
    });
  });

  it('allows an empty d-tag', () => {
    expect(parseAddr(`30023:${PUBKEY}:`)).toEqual({
      kind: 30023,
      pubkey: PUBKEY,
      identifier: '',
    });
  });

  it('preserves colons inside the d-tag', () => {
    expect(parseAddr(`30000:${PUBKEY}:foo:bar:baz`)).toEqual({
      kind: 30000,
      pubkey: PUBKEY,
      identifier: 'foo:bar:baz',
    });
  });

  it('rejects fewer than three segments', () => {
    expect(parseAddr('')).toBeUndefined();
    expect(parseAddr('30023')).toBeUndefined();
    expect(parseAddr(`30023:${PUBKEY}`)).toBeUndefined();
  });

  it('rejects a non-numeric kind segment', () => {
    expect(parseAddr(`kind:${PUBKEY}:d`)).toBeUndefined();
  });

  it('rejects a malformed pubkey (length 9 — the original crash repro)', () => {
    expect(parseAddr('30009:123456789:my-badge')).toBeUndefined();
  });

  it('rejects an uppercase pubkey', () => {
    expect(parseAddr(`30009:${PUBKEY.toUpperCase()}:my-badge`)).toBeUndefined();
  });

  it('rejects undefined input', () => {
    expect(parseAddr(undefined)).toBeUndefined();
  });
});
