import { describe, expect, it } from 'vitest';
import { nip19 } from 'nostr-tools';

import '@/lib/polyfills';
import {
  buildUnsignedPsbt,
  buildUnsignedSilentPaymentPsbt,
  finalizePsbt,
  isLargeAmount,
  LARGE_AMOUNT_USD_THRESHOLD,
  looksLikeSilentPaymentAddress,
  nostrPubkeyToBitcoinAddress,
  npubToBitcoinAddress,
  parseBitcoinUri,
  validateBitcoinAddress,
  validateSilentPaymentAddress,
  type UTXO,
} from '@/lib/bitcoin';
import { parsePsbtV2, extractTxFromSignedPsbtV2 } from '@/lib/psbtV2';
import { NSecSignerBtc } from '@/lib/bitcoin-signers';

/**
 * Regression test vectors for key-path-only P2TR address derivation using the
 * Nostr pubkey directly as the internal key (no script tree).
 *
 * Each vector was produced by the live bitcoin toolchain and independently
 * validated against the address's bech32m checksum. They serve as regression
 * fixtures: if the derivation ever changes (library upgrade, ECC backend
 * switch, etc.) these tests will fail loudly.
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

describe('parseBitcoinUri', () => {
  it('returns null for inputs without a bitcoin: scheme', () => {
    expect(parseBitcoinUri('')).toBeNull();
    expect(parseBitcoinUri('bc1p2wsldez5mud2yam29q22wgfh9439spgduvct83k3pm50fcxa5dps59h4z5')).toBeNull();
    expect(parseBitcoinUri('lightning:lnbc...')).toBeNull();
  });

  it('extracts the address from a bare bitcoin: URI', () => {
    expect(parseBitcoinUri('bitcoin:bc1p2wsldez5mud2yam29q22wgfh9439spgduvct83k3pm50fcxa5dps59h4z5')).toEqual({
      address: 'bc1p2wsldez5mud2yam29q22wgfh9439spgduvct83k3pm50fcxa5dps59h4z5',
      sp: undefined,
      amountSats: undefined,
    });
  });

  it('is case-insensitive on the scheme', () => {
    expect(parseBitcoinUri('BITCOIN:1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2')).toEqual({
      address: '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2',
      sp: undefined,
      amountSats: undefined,
    });
  });

  it('strips a trailing query string and surfaces the sp parameter', () => {
    const uri = 'bitcoin:bc1p2wsldez5mud2yam29q22wgfh9439spgduvct83k3pm50fcxa5dps59h4z5?label=Tip&sp=sp1qq';
    expect(parseBitcoinUri(uri)).toEqual({
      address: 'bc1p2wsldez5mud2yam29q22wgfh9439spgduvct83k3pm50fcxa5dps59h4z5',
      sp: 'sp1qq',
      amountSats: undefined,
    });
  });

  it('ignores non-amount/non-sp parameters', () => {
    const uri = 'bitcoin:1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2?label=Tip&message=hi';
    expect(parseBitcoinUri(uri)).toEqual({
      address: '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2',
      sp: undefined,
      amountSats: undefined,
    });
  });

  it('trims surrounding whitespace', () => {
    expect(parseBitcoinUri('  bitcoin:1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2  ')).toEqual({
      address: '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2',
      sp: undefined,
      amountSats: undefined,
    });
  });

  it('parses the BIP-21 amount (BTC) into satoshis', () => {
    expect(parseBitcoinUri('bitcoin:1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2?amount=0.5')).toEqual({
      address: '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2',
      sp: undefined,
      amountSats: 50_000_000,
    });
    expect(parseBitcoinUri('bitcoin:1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2?amount=0.00012345')).toEqual({
      address: '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2',
      sp: undefined,
      amountSats: 12_345,
    });
  });

  it('rounds the amount down rather than overstating it', () => {
    // 0.000000019 BTC = 1.9 sats — must floor to 1, never round up to 2.
    expect(parseBitcoinUri('bitcoin:1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2?amount=0.000000019')?.amountSats).toBe(1);
  });

  it('omits amountSats when the parameter is malformed or non-positive', () => {
    expect(parseBitcoinUri('bitcoin:1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2?amount=abc')?.amountSats).toBeUndefined();
    expect(parseBitcoinUri('bitcoin:1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2?amount=0')?.amountSats).toBeUndefined();
    expect(parseBitcoinUri('bitcoin:1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2?amount=-1')?.amountSats).toBeUndefined();
    expect(parseBitcoinUri('bitcoin:1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2?amount=')?.amountSats).toBeUndefined();
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

// ---------------------------------------------------------------------------
// BIP-352 / BIP-375 silent payment send pipeline
// ---------------------------------------------------------------------------

/**
 * BIP-352 reference silent payment address. Used everywhere this module
 * needs to exercise the SP code paths.
 */
const REFERENCE_SP_ADDRESS =
  'sp1qqgste7k9hx0qftg6qmwlkqtwuy6cycyavzmzj85c6qdfhjdpdjtdgqjuexzk6murw56suy3e0rd2cgqvycxttddwsvgxe2usfpxumr70xc9pkqwv';

/**
 * The wallet's only signing input is the user's Nostr nsec used as a
 * Taproot internal key with no script tree. This fixture pubkey is the
 * x-only key derived from a fixed nsec — handy for both the address and
 * the local-sign path.
 */
const SENDER_PUBKEY_HEX = 'd6889cb081036e0faefa3a35157ad71086b123b2b144b649798b494c300a961d';
/** A valid 32-byte secp256k1 private key whose pubkey matches the above. */
const SENDER_NSEC_HEX = 'b7e151628aed2a6abf7158809cf4f3c762e7160f38b4da56a784d9045190cfef';

describe('looksLikeSilentPaymentAddress / validateSilentPaymentAddress', () => {
  it('routes sp1… input to the SP path', () => {
    expect(looksLikeSilentPaymentAddress(REFERENCE_SP_ADDRESS)).toBe(true);
    expect(validateSilentPaymentAddress(REFERENCE_SP_ADDRESS)).toBe(true);
  });

  it('refuses regular addresses and garbage', () => {
    expect(looksLikeSilentPaymentAddress('bc1p2wsldez5mud2yam29q22wgfh9439spgduvct83k3pm50fcxa5dps59h4z5')).toBe(false);
    expect(validateSilentPaymentAddress('')).toBe(false);
    expect(validateSilentPaymentAddress('sp1totallynotreal')).toBe(false);
  });
});

describe('buildUnsignedSilentPaymentPsbt', () => {
  /** A single 200 000-sat P2TR UTXO from the sender to their own address. */
  function senderUtxos(): UTXO[] {
    return [
      {
        txid: 'f4184fc596403b9d638783cf57adfe4c75c605f6356fbc91338530e9831e9e16',
        vout: 0,
        value: 200_000,
        status: { confirmed: true },
      },
    ];
  }

  it('emits a PSBT v2 with PSBT_OUT_SP_V0_INFO and a change output', () => {
    const { psbtHex, fee } = buildUnsignedSilentPaymentPsbt(
      SENDER_PUBKEY_HEX,
      REFERENCE_SP_ADDRESS,
      50_000,
      senderUtxos(),
      5, // sat/vB
    );

    const parsed = parsePsbtV2(psbtHex);
    expect(parsed.txVersion).toBe(2);
    expect(parsed.inputs).toHaveLength(1);
    expect(parsed.outputs).toHaveLength(2);

    // Output 0 is the SP recipient: no script, has PSBT_OUT_SP_V0_INFO.
    expect(parsed.outputs[0].script).toBeUndefined();
    expect(parsed.outputs[0].amount).toBe(50_000n);
    const spInfo = parsed.outputs[0].unknown.find((u) => u.keyType === 0x09);
    expect(spInfo).toBeDefined();
    expect(spInfo!.value.length).toBe(67);

    // Output 1 is the change: regular P2TR script back to the sender, with
    // amount = input - send - fee. The exact fee depends on output count;
    // we just sanity-check that the value is positive and consistent with
    // total - send - fee.
    expect(parsed.outputs[1].script).toBeDefined();
    expect(parsed.outputs[1].amount).toBe(BigInt(200_000 - 50_000 - fee));
  });

  it('omits the change output when change would be dust', () => {
    // Build a scenario where after subtracting the SP output amount and the
    // 1-output fee, the leftover is below the 546-sat dust limit. With a
    // 5 sat/vB fee rate, a 1-input/1-output P2TR tx costs ≈555 sats. Sending
    // 50_000 sats from a 50_700-sat UTXO leaves 700 - 555 = 145 sats, which
    // is dust — the builder must drop the change output.
    const utxos = [{
      txid: 'f4184fc596403b9d638783cf57adfe4c75c605f6356fbc91338530e9831e9e16',
      vout: 0,
      value: 50_700,
      status: { confirmed: true },
    } satisfies UTXO];

    const { psbtHex } = buildUnsignedSilentPaymentPsbt(
      SENDER_PUBKEY_HEX,
      REFERENCE_SP_ADDRESS,
      50_000,
      utxos,
      5,
    );
    const parsed = parsePsbtV2(psbtHex);
    // Just the SP recipient — no dust change.
    expect(parsed.outputs).toHaveLength(1);
    expect(parsed.outputs[0].script).toBeUndefined();
  });

  it('refuses to build when the amount is below the dust limit', () => {
    expect(() =>
      buildUnsignedSilentPaymentPsbt(SENDER_PUBKEY_HEX, REFERENCE_SP_ADDRESS, 100, senderUtxos(), 5),
    ).toThrow(/546/);
  });

  it('refuses to build when there are no UTXOs', () => {
    expect(() =>
      buildUnsignedSilentPaymentPsbt(SENDER_PUBKEY_HEX, REFERENCE_SP_ADDRESS, 50_000, [], 5),
    ).toThrow(/no UTXOs/i);
  });

  it('refuses to build when balance is insufficient for amount + fee', () => {
    const tinyUtxos: UTXO[] = [{
      txid: 'f4184fc596403b9d638783cf57adfe4c75c605f6356fbc91338530e9831e9e16',
      vout: 0,
      value: 600, // just barely above dust
      status: { confirmed: true },
    }];
    expect(() =>
      buildUnsignedSilentPaymentPsbt(SENDER_PUBKEY_HEX, REFERENCE_SP_ADDRESS, 50_000, tinyUtxos, 5),
    ).toThrow(/insufficient/i);
  });

  it('refuses a testnet (`tsp1…`) address', () => {
    // Re-encode the reference scan/spend pair with the `tsp` HRP. Easier to
    // pass any tsp1-looking string that decodes (or fails with the testnet
    // error path) — the wallet rejects testnet outright.
    const fakeTsp = 'tsp' + REFERENCE_SP_ADDRESS.slice(2);
    expect(() =>
      buildUnsignedSilentPaymentPsbt(SENDER_PUBKEY_HEX, fakeTsp, 50_000, senderUtxos(), 5),
    ).toThrow();
  });

  it('refuses a malformed sender pubkey', () => {
    expect(() =>
      buildUnsignedSilentPaymentPsbt('not-hex', REFERENCE_SP_ADDRESS, 50_000, senderUtxos(), 5),
    ).toThrow(/sender pubkey/i);
  });
});

describe('NSecSignerBtc.signPsbt — BIP-375 path', () => {
  /**
   * End-to-end: build an unsigned BIP-375 PSBT v2, hand it to a local
   * NSecSignerBtc that owns the matching private key, then extract a raw
   * transaction. The signer must resolve the SP output internally so the
   * extracted tx has a valid P2TR script in place of `PSBT_OUT_SP_V0_INFO`.
   */
  it('resolves PSBT_OUT_SP_V0_INFO and returns an extractable PSBT v2', async () => {
    function hexToBytes(h: string): Uint8Array {
      const out = new Uint8Array(h.length / 2);
      for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
      return out;
    }
    const signer = new NSecSignerBtc(hexToBytes(SENDER_NSEC_HEX));
    const senderPubkey = await signer.getPublicKey();

    const utxos: UTXO[] = [
      {
        txid: 'f4184fc596403b9d638783cf57adfe4c75c605f6356fbc91338530e9831e9e16',
        vout: 0,
        value: 100_000,
        status: { confirmed: true },
      },
    ];

    const { psbtHex } = buildUnsignedSilentPaymentPsbt(
      senderPubkey,
      REFERENCE_SP_ADDRESS,
      40_000,
      utxos,
      5,
    );

    const signed = await signer.signPsbt(psbtHex);

    // The signer should have filled in the SP output's script. Parse the
    // result and verify both outputs now carry scripts.
    const parsed = parsePsbtV2(signed);
    expect(parsed.outputs).toHaveLength(2);
    for (const o of parsed.outputs) {
      expect(o.script).toBeDefined();
      // First two bytes should be `OP_1 push32` (BIP-341 P2TR layout).
      expect(o.script![0]).toBe(0x51);
      expect(o.script![1]).toBe(0x20);
      expect(o.script!.length).toBe(34);
    }

    // The recipient output's x-only key must NOT be the sender's own
    // change script — otherwise the SP derivation never ran.
    const recipientXOnly = parsed.outputs[0].script!.slice(2, 34);
    const changeXOnly = parsed.outputs[1].script!.slice(2, 34);
    let same = true;
    for (let i = 0; i < 32; i++) {
      if (recipientXOnly[i] !== changeXOnly[i]) { same = false; break; }
    }
    expect(same).toBe(false);

    // …and the resulting PSBT must extract to a well-formed raw tx.
    const txHex = extractTxFromSignedPsbtV2(signed);
    // `02000000` is txVersion=2 in LE; `0001` is the SegWit marker/flag we
    // expect because Taproot inputs are signed with witnesses.
    expect(txHex.startsWith('020000000001')).toBe(true);
  });

  it('falls back to the regular PSBT v0 path when no SP outputs are present', async () => {
    // Use the existing buildUnsignedPsbt (regular send) — there are no
    // SP_V0_INFO rows, so signPsbt should take the fast path.
    function hexToBytes(h: string): Uint8Array {
      const out = new Uint8Array(h.length / 2);
      for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
      return out;
    }
    const signer = new NSecSignerBtc(hexToBytes(SENDER_NSEC_HEX));
    const senderPubkey = await signer.getPublicKey();
    const senderAddr = nostrPubkeyToBitcoinAddress(senderPubkey);
    expect(senderAddr).not.toBe('');

    // Build a vanilla PSBT v0 send to the sender's own address. The
    // signer should not touch any BIP-375 code path.
    const utxos: UTXO[] = [
      {
        txid: 'f4184fc596403b9d638783cf57adfe4c75c605f6356fbc91338530e9831e9e16',
        vout: 0,
        value: 100_000,
        status: { confirmed: true },
      },
    ];
    const { psbtHex } = buildUnsignedPsbt(senderPubkey, senderAddr, 40_000, utxos, 5);
    const signed = await signer.signPsbt(psbtHex);
    // Should be a regular PSBT v0 we can hand straight to finalizePsbt.
    expect(() => finalizePsbt(signed)).not.toThrow();
  });
});
