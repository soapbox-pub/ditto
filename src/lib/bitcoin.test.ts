import { beforeAll, describe, expect, it } from 'vitest';
import { nip19 } from 'nostr-tools';
import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from '@bitcoinerlab/secp256k1';

import '@/lib/polyfills';
import {
  isLargeAmount,
  LARGE_AMOUNT_USD_THRESHOLD,
  nostrPubkeyToBitcoinAddress,
  npubToBitcoinAddress,
  validateBitcoinAddress,
} from '@/lib/bitcoin';

// Initialise ECC once for this test file. In the running app, `main.tsx`
// does this at startup; in a test process `main.tsx` is never imported.
beforeAll(() => {
  bitcoin.initEccLib(ecc);
});

/**
 * Regression test vectors for key-path-only P2TR address derivation using the
 * Nostr pubkey directly as the internal key (no script tree).
 *
 * Each vector was produced by the live `bitcoinjs-lib` + `@bitcoinerlab/secp256k1`
 * toolchain and independently validated against the address's bech32m
 * checksum. They serve as regression fixtures: if the derivation ever changes
 * (library upgrade, ECC backend switch, etc.) these tests will fail loudly.
 *
 * Note: these are NOT the addresses in the BIP-341 wallet test vectors,
 * because those vectors use a non-empty script tree (merkle root); our
 * implementation uses a key-path-only spend path (empty merkle root), which
 * is the correct derivation for mapping a Nostr pubkey to a spendable address.
 */
describe('nostrPubkeyToBitcoinAddress', () => {
  it('derives the expected key-path-only Taproot address (fixture 1)', () => {
    const internalPubkey = 'd6889cb081036e0faefa3a35157ad71086b123b2b144b649798b494c300a961d';
    const expected = 'bc1p2wsldez5mud2yam29q22wgfh9439spgduvct83k3pm50fcxa5dps59h4z5';

    expect(nostrPubkeyToBitcoinAddress(internalPubkey)).toBe(expected);
  });

  it('derives the expected key-path-only Taproot address (fixture 2)', () => {
    const internalPubkey = '187791b6f712a8ea41c8ecdd0ee77fab3e85263b37e1ec18a3651926b3a6cf27';
    const expected = 'bc1pjxzw9tm6qatyapu3c409dg8k23p4hjlk4ehwwlsum3emjqsaetrqppyu2z';

    expect(nostrPubkeyToBitcoinAddress(internalPubkey)).toBe(expected);
  });

  it('derives the expected key-path-only Taproot address (fixture 3)', () => {
    const internalPubkey = '82341f882b6eabcd2ba7f1ef90aad961cf074af15b9ef44a09f9d2a8fbfbe6a2';
    const expected = 'bc1p2jdrzv2w45xws7qlguk0acmz9clje8fasvhx3kv3cgpmhm8qtzhsq6fyhy';

    expect(nostrPubkeyToBitcoinAddress(internalPubkey)).toBe(expected);
  });

  it('produces a bech32m mainnet address that passes validation', () => {
    const pubkey = '82341f882b6eabcd2ba7f1ef90aad961cf074af15b9ef44a09f9d2a8fbfbe6a2';

    const address = nostrPubkeyToBitcoinAddress(pubkey);

    expect(address.startsWith('bc1p')).toBe(true);
    expect(validateBitcoinAddress(address)).toBe(true);
  });

  it('is deterministic — same input yields the same non-empty address', () => {
    // Use a pubkey known to be a valid on-curve secp256k1 x-only point.
    const pubkey = 'd6889cb081036e0faefa3a35157ad71086b123b2b144b649798b494c300a961d';

    const a1 = nostrPubkeyToBitcoinAddress(pubkey);
    const a2 = nostrPubkeyToBitcoinAddress(pubkey);
    expect(a1).toBe(a2);
    expect(a1).not.toBe('');
  });

  it('returns empty string for malformed pubkeys instead of throwing', () => {
    // Too short.
    expect(nostrPubkeyToBitcoinAddress('abc')).toBe('');
    // Non-hex characters.
    expect(nostrPubkeyToBitcoinAddress('z'.repeat(64))).toBe('');
    // Empty string.
    expect(nostrPubkeyToBitcoinAddress('')).toBe('');
    // Odd length (not a whole number of bytes).
    expect(nostrPubkeyToBitcoinAddress('a'.repeat(63))).toBe('');
  });

  it('returns empty string for hex that is not a valid secp256k1 x-only point', () => {
    // Suppress the catch-block console.error for this test so it doesn't
    // pollute the test output. The function is expected to log and return ''.
    const origError = console.error;
    console.error = () => {};
    try {
      // Valid 64-char hex, but not a valid on-curve secp256k1 x-only point.
      expect(nostrPubkeyToBitcoinAddress('e7a2e3b5f1c8d4a6b9c0e1f2d3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2')).toBe('');
    } finally {
      console.error = origError;
    }
  });

  it('accepts both upper- and lower-case hex', () => {
    const lower = 'd6889cb081036e0faefa3a35157ad71086b123b2b144b649798b494c300a961d';
    const upper = lower.toUpperCase();

    expect(nostrPubkeyToBitcoinAddress(lower)).toBe(nostrPubkeyToBitcoinAddress(upper));
  });
});

describe('npubToBitcoinAddress', () => {
  it('decodes an npub and derives the matching Taproot address', () => {
    // Any valid Nostr pubkey works — we just verify round-trip consistency.
    const pubkey = '82341f882b6eabcd2ba7f1ef90aad961cf074af15b9ef44a09f9d2a8fbfbe6a2';
    const npub = nip19.npubEncode(pubkey);

    const fromHex = nostrPubkeyToBitcoinAddress(pubkey);
    const fromNpub = npubToBitcoinAddress(npub);

    expect(fromNpub).toBe(fromHex);
  });

  it('throws on non-npub NIP-19 input', () => {
    const note = nip19.noteEncode('d6889cb081036e0faefa3a35157ad71086b123b2b144b649798b494c300a961d');
    expect(() => npubToBitcoinAddress(note)).toThrow(/npub/i);
  });
});

describe('validateBitcoinAddress', () => {
  it('accepts valid bech32m P2TR addresses', () => {
    expect(validateBitcoinAddress('bc1p2wsldez5mud2yam29q22wgfh9439spgduvct83k3pm50fcxa5dps59h4z5')).toBe(true);
  });

  it('accepts legacy P2PKH and P2SH addresses', () => {
    expect(validateBitcoinAddress('1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2')).toBe(true);
    expect(validateBitcoinAddress('3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy')).toBe(true);
  });

  it('rejects malformed addresses', () => {
    expect(validateBitcoinAddress('')).toBe(false);
    expect(validateBitcoinAddress('not-an-address')).toBe(false);
    // Valid-looking bech32m with broken checksum (flipped last char).
    expect(validateBitcoinAddress('bc1p2wsldez5mud2yam29q22wgfh9439spgduvct83k3pm50fcxa5dps59h4z6')).toBe(false);
  });
});

describe('isLargeAmount', () => {
  // Assume a BTC price of $100_000 for easy arithmetic. 1 BTC = $100k, so
  // 1 sat = $0.001 and the $100 threshold corresponds to 100_000 sats.
  const PRICE = 100_000;

  it('returns true when the USD value is above the threshold', () => {
    // 200,000 sats @ $100k/BTC = $200 — well above $100.
    expect(isLargeAmount(200_000, PRICE)).toBe(true);
  });

  it('returns true at exactly the threshold', () => {
    // 100,000 sats @ $100k/BTC = $100 — at the threshold (inclusive).
    expect(isLargeAmount(100_000, PRICE)).toBe(true);
  });

  it('returns false below the threshold', () => {
    // 50,000 sats @ $100k/BTC = $50 — below $100.
    expect(isLargeAmount(50_000, PRICE)).toBe(false);
  });

  it('returns false when btcPrice is undefined', () => {
    expect(isLargeAmount(10_000_000, undefined)).toBe(false);
  });

  it('returns false for non-positive sats or prices', () => {
    expect(isLargeAmount(0, PRICE)).toBe(false);
    expect(isLargeAmount(-1, PRICE)).toBe(false);
    expect(isLargeAmount(100_000, 0)).toBe(false);
    expect(isLargeAmount(100_000, -PRICE)).toBe(false);
    expect(isLargeAmount(100_000, NaN)).toBe(false);
  });

  it('exports a sensible default threshold', () => {
    expect(LARGE_AMOUNT_USD_THRESHOLD).toBe(100);
  });
});
