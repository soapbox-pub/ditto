import { describe, it, expect } from 'vitest';

import {
  decodeSilentPaymentAddress,
  deriveSilentPaymentOutputScript,
  isSilentPaymentAddress,
  validateSilentPaymentAddress,
} from '@/lib/silentPayments';

/**
 * The BIP-352 reference vector everyone in the ecosystem tests against:
 *   spend_priv = 9d6ad855ce3417ef84e836892e5a56392bfba05fa5d97ccea30e266f540e08b3
 *   scan_priv  = 0f694e068028a717f8af6b9411f9a133dd3565258714cc226594b34db90c1f2c
 *
 * https://github.com/bitcoin/bips/blob/master/bip-0352/send_and_receive_test_vectors.json
 */
const REFERENCE_SP_ADDRESS =
  'sp1qqgste7k9hx0qftg6qmwlkqtwuy6cycyavzmzj85c6qdfhjdpdjtdgqjuexzk6murw56suy3e0rd2cgqvycxttddwsvgxe2usfpxumr70xc9pkqwv';
const REFERENCE_SCAN_HEX = '0220bcfac5b99e04ad1a06ddfb016ee13582609d60b6291e98d01a9bc9a16c96d4';
const REFERENCE_SPEND_HEX = '025cc9856d6f8375350e123978daac200c260cb5b5ae83106cab90484dcd8fcf36';

function bytesToHex(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i++) s += b[i].toString(16).padStart(2, '0');
  return s;
}

function hexToBytes(h: string): Uint8Array {
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

describe('isSilentPaymentAddress', () => {
  it('recognises mainnet sp1… addresses', () => {
    expect(isSilentPaymentAddress(REFERENCE_SP_ADDRESS)).toBe(true);
  });

  it('recognises testnet tsp1… addresses', () => {
    expect(isSilentPaymentAddress('tsp1qabcdef')).toBe(true);
  });

  it('is case-insensitive on the prefix', () => {
    expect(isSilentPaymentAddress(REFERENCE_SP_ADDRESS.toUpperCase())).toBe(true);
  });

  it('rejects regular Bitcoin addresses', () => {
    expect(isSilentPaymentAddress('bc1p2wsldez5mud2yam29q22wgfh9439spgduvct83k3pm50fcxa5dps59h4z5')).toBe(false);
    expect(isSilentPaymentAddress('1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2')).toBe(false);
    expect(isSilentPaymentAddress('3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy')).toBe(false);
  });

  it('rejects empty and non-string input', () => {
    expect(isSilentPaymentAddress('')).toBe(false);
    expect(isSilentPaymentAddress(undefined as unknown as string)).toBe(false);
    expect(isSilentPaymentAddress(null as unknown as string)).toBe(false);
  });
});

describe('decodeSilentPaymentAddress', () => {
  it('decodes the BIP-352 reference address into the expected scan/spend keys', () => {
    const decoded = decodeSilentPaymentAddress(REFERENCE_SP_ADDRESS);
    expect(decoded.hrp).toBe('sp');
    expect(decoded.network).toBe('mainnet');
    expect(decoded.version).toBe(0);
    expect(bytesToHex(decoded.scanPubKey)).toBe(REFERENCE_SCAN_HEX);
    expect(bytesToHex(decoded.spendPubKey)).toBe(REFERENCE_SPEND_HEX);
  });

  it('produces fresh Uint8Arrays so mutating the result does not affect future decodes', () => {
    const a = decodeSilentPaymentAddress(REFERENCE_SP_ADDRESS);
    a.scanPubKey[0] = 0xff;
    const b = decodeSilentPaymentAddress(REFERENCE_SP_ADDRESS);
    expect(b.scanPubKey[0]).not.toBe(0xff);
  });

  it('accepts the address in upper-case as well as lower-case', () => {
    const lower = decodeSilentPaymentAddress(REFERENCE_SP_ADDRESS);
    const upper = decodeSilentPaymentAddress(REFERENCE_SP_ADDRESS.toUpperCase());
    expect(bytesToHex(upper.scanPubKey)).toBe(bytesToHex(lower.scanPubKey));
    expect(bytesToHex(upper.spendPubKey)).toBe(bytesToHex(lower.spendPubKey));
  });

  it('rejects mixed-case addresses', () => {
    // Flip the case of one character in the middle to create a mixed-case string.
    const mixed = REFERENCE_SP_ADDRESS.slice(0, 20) + REFERENCE_SP_ADDRESS[20].toUpperCase() + REFERENCE_SP_ADDRESS.slice(21);
    expect(() => decodeSilentPaymentAddress(mixed)).toThrow(/mixed case/i);
  });

  it('rejects addresses with a corrupted checksum', () => {
    // Flip the final character to break the checksum.
    const last = REFERENCE_SP_ADDRESS[REFERENCE_SP_ADDRESS.length - 1];
    const replacement = last === 'v' ? 'p' : 'v';
    const corrupted = REFERENCE_SP_ADDRESS.slice(0, -1) + replacement;
    expect(() => decodeSilentPaymentAddress(corrupted)).toThrow(/checksum|invalid character/i);
  });

  it('rejects unknown HRPs', () => {
    // Re-encode with a totally bogus HRP — easier to test by swapping the
    // first two characters of a known-good string and expecting either an
    // HRP or checksum failure (both indicate the decoder refused the input).
    expect(() => decodeSilentPaymentAddress('xx' + REFERENCE_SP_ADDRESS.slice(2))).toThrow();
  });

  it('rejects empty input', () => {
    expect(() => decodeSilentPaymentAddress('')).toThrow(/empty/i);
  });

  it('rejects strings missing a bech32 separator', () => {
    expect(() => decodeSilentPaymentAddress('spnoseparator')).toThrow();
  });

  it('rejects strings longer than the 1023-character forward-compat ceiling', () => {
    const huge = 'sp1' + 'q'.repeat(1024);
    expect(() => decodeSilentPaymentAddress(huge)).toThrow(/too long/i);
  });
});

describe('validateSilentPaymentAddress', () => {
  it('returns true for a valid sp1… address', () => {
    expect(validateSilentPaymentAddress(REFERENCE_SP_ADDRESS)).toBe(true);
  });

  it('returns false for any string the decoder would throw on', () => {
    expect(validateSilentPaymentAddress('')).toBe(false);
    expect(validateSilentPaymentAddress('sp1notvalid')).toBe(false);
    expect(validateSilentPaymentAddress('bc1p2wsldez5mud2yam29q22wgfh9439spgduvct83k3pm50fcxa5dps59h4z5')).toBe(false);
  });
});

describe('deriveSilentPaymentOutputScript', () => {
  /**
   * BIP-352 vector "Single recipient: taproot only inputs with even y-values".
   * Both inputs are Taproot, both pubkeys already have even Y so no negation
   * fires — that lets us exercise the happy-path of the algorithm cleanly.
   *
   * Expected x-only output:
   *   de88bea8e7ffc9ce1af30d1132f910323c505185aec8eae361670421e749a1fb
   */
  it('matches the BIP-352 reference output for a two-input taproot send', () => {
    const sp = decodeSilentPaymentAddress(REFERENCE_SP_ADDRESS);

    const xonly = deriveSilentPaymentOutputScript(
      [
        {
          txid: 'f4184fc596403b9d638783cf57adfe4c75c605f6356fbc91338530e9831e9e16',
          vout: 0,
          privateKey: hexToBytes('eadc78165ff1f8ea94ad7cfdc54990738a4c53f6e0507b42154201b8e5dff3b1'),
          isTaproot: true,
        },
        {
          txid: 'a1075db55d416d3ca199f55b6084e2115b9345e16c5cf302fc80e9d5fbf5d48d',
          vout: 0,
          privateKey: hexToBytes('fc8716a97a48ba9a05a98ae47b5cd201a25a7fd5d8b73c203c5f7b6b6b3b6ad7'),
          isTaproot: true,
        },
      ],
      sp,
    );

    expect(bytesToHex(xonly)).toBe('de88bea8e7ffc9ce1af30d1132f910323c505185aec8eae361670421e749a1fb');
  });

  it('is independent of the order inputs are provided in', () => {
    const sp = decodeSilentPaymentAddress(REFERENCE_SP_ADDRESS);

    const inputs = [
      {
        txid: 'f4184fc596403b9d638783cf57adfe4c75c605f6356fbc91338530e9831e9e16',
        vout: 0,
        privateKey: hexToBytes('eadc78165ff1f8ea94ad7cfdc54990738a4c53f6e0507b42154201b8e5dff3b1'),
        isTaproot: true,
      },
      {
        txid: 'a1075db55d416d3ca199f55b6084e2115b9345e16c5cf302fc80e9d5fbf5d48d',
        vout: 0,
        privateKey: hexToBytes('fc8716a97a48ba9a05a98ae47b5cd201a25a7fd5d8b73c203c5f7b6b6b3b6ad7'),
        isTaproot: true,
      },
    ];

    const forward = deriveSilentPaymentOutputScript(inputs, sp);
    const reversed = deriveSilentPaymentOutputScript([...inputs].reverse(), sp);
    expect(bytesToHex(reversed)).toBe(bytesToHex(forward));
  });

  it('returns a 32-byte x-only key (the BIP-341 taproot output script payload)', () => {
    const sp = decodeSilentPaymentAddress(REFERENCE_SP_ADDRESS);
    const out = deriveSilentPaymentOutputScript(
      [
        {
          txid: 'f4184fc596403b9d638783cf57adfe4c75c605f6356fbc91338530e9831e9e16',
          vout: 0,
          privateKey: hexToBytes('eadc78165ff1f8ea94ad7cfdc54990738a4c53f6e0507b42154201b8e5dff3b1'),
          isTaproot: true,
        },
      ],
      sp,
    );
    expect(out.byteLength).toBe(32);
  });

  it('throws when given no inputs', () => {
    const sp = decodeSilentPaymentAddress(REFERENCE_SP_ADDRESS);
    expect(() => deriveSilentPaymentOutputScript([], sp)).toThrow(/at least one/i);
  });

  it('throws when an input has a malformed (non-32-byte) private key', () => {
    const sp = decodeSilentPaymentAddress(REFERENCE_SP_ADDRESS);
    expect(() =>
      deriveSilentPaymentOutputScript(
        [
          {
            txid: 'f4184fc596403b9d638783cf57adfe4c75c605f6356fbc91338530e9831e9e16',
            vout: 0,
            privateKey: new Uint8Array(31),
            isTaproot: true,
          },
        ],
        sp,
      ),
    ).toThrow(/32 bytes/i);
  });

  it('throws when an input private key is zero', () => {
    const sp = decodeSilentPaymentAddress(REFERENCE_SP_ADDRESS);
    expect(() =>
      deriveSilentPaymentOutputScript(
        [
          {
            txid: 'f4184fc596403b9d638783cf57adfe4c75c605f6356fbc91338530e9831e9e16',
            vout: 0,
            privateKey: new Uint8Array(32), // all-zero
            isTaproot: true,
          },
        ],
        sp,
      ),
    ).toThrow();
  });
});
