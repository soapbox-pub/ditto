import { describe, it, expect } from 'vitest';

import {
  encodeCompactSize,
  encodePsbtV2,
  extractTxFromSignedPsbtV2,
  parsePsbtV2,
} from '@/lib/psbtV2';

function hexToBytes(h: string): Uint8Array {
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function bytesToHex(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i++) s += b[i].toString(16).padStart(2, '0');
  return s;
}

/** A deterministic 32-byte "txid" string for test fixtures (display-order hex). */
const TXID_A = 'f4184fc596403b9d638783cf57adfe4c75c605f6356fbc91338530e9831e9e16';

/** Sender's x-only Taproot pubkey (32 bytes, valid on secp256k1 curve). */
const TAP_INTERNAL_KEY = new Uint8Array(hexToBytes('d6889cb081036e0faefa3a35157ad71086b123b2b144b649798b494c300a961d'));

/** Sender's previous output's scriptPubKey: `OP_1 push32 <xonly>` (34 bytes). */
const SENDER_SCRIPT = (() => {
  const s = new Uint8Array(34);
  s[0] = 0x51;
  s[1] = 0x20;
  s.set(TAP_INTERNAL_KEY, 2);
  return s;
})();

/** Recipient SP scan/spend public keys (33 bytes each, valid on curve). */
const SCAN_PUBKEY = hexToBytes('0220bcfac5b99e04ad1a06ddfb016ee13582609d60b6291e98d01a9bc9a16c96d4');
const SPEND_PUBKEY = hexToBytes('025cc9856d6f8375350e123978daac200c260cb5b5ae83106cab90484dcd8fcf36');

describe('encodeCompactSize', () => {
  it('encodes single-byte values directly', () => {
    expect(bytesToHex(encodeCompactSize(0))).toBe('00');
    expect(bytesToHex(encodeCompactSize(1))).toBe('01');
    expect(bytesToHex(encodeCompactSize(252))).toBe('fc');
  });

  it('encodes values in [253, 0xFFFF] with a 0xfd prefix', () => {
    expect(bytesToHex(encodeCompactSize(253))).toBe('fdfd00');
    expect(bytesToHex(encodeCompactSize(0xffff))).toBe('fdffff');
  });

  it('encodes values in (0xFFFF, 0xFFFFFFFF] with a 0xfe prefix', () => {
    expect(bytesToHex(encodeCompactSize(0x10000))).toBe('fe00000100');
    expect(bytesToHex(encodeCompactSize(0xffffffff))).toBe('feffffffff');
  });

  it('rejects negative or non-integer values', () => {
    expect(() => encodeCompactSize(-1)).toThrow();
    expect(() => encodeCompactSize(NaN)).toThrow();
  });

  it('refuses values that overflow 32-bit (we don’t construct multi-GB PSBTs)', () => {
    expect(() => encodeCompactSize(0x1_0000_0000)).toThrow();
  });
});

describe('encodePsbtV2 / parsePsbtV2', () => {
  it('emits a PSBT v2 header that the parser round-trips', () => {
    const hex = encodePsbtV2({
      inputs: [
        {
          txid: TXID_A,
          vout: 0,
          witnessUtxo: { amount: 100_000n, script: SENDER_SCRIPT },
          tapInternalKey: TAP_INTERNAL_KEY,
        },
      ],
      outputs: [
        { type: 'script', amount: 50_000n, script: SENDER_SCRIPT },
      ],
    });

    // PSBT magic: `0x70 0x73 0x62 0x74 0xff` ("psbt" + 0xff).
    expect(hex.startsWith('70736274ff')).toBe(true);

    const parsed = parsePsbtV2(hex);
    expect(parsed.txVersion).toBe(2);
    expect(parsed.fallbackLocktime).toBe(0);
    expect(parsed.inputs).toHaveLength(1);
    expect(parsed.outputs).toHaveLength(1);
  });

  it('round-trips the input txid (display-order ↔ wire little-endian)', () => {
    const hex = encodePsbtV2({
      inputs: [
        {
          txid: TXID_A,
          vout: 7,
          witnessUtxo: { amount: 1n, script: SENDER_SCRIPT },
        },
      ],
      outputs: [{ type: 'script', amount: 1n, script: SENDER_SCRIPT }],
    });
    const parsed = parsePsbtV2(hex);
    expect(parsed.inputs[0].txid).toBe(TXID_A);
    expect(parsed.inputs[0].vout).toBe(7);
  });

  it('preserves the witness UTXO amount and script', () => {
    const amount = 1_234_567_890n;
    const hex = encodePsbtV2({
      inputs: [{ txid: TXID_A, vout: 0, witnessUtxo: { amount, script: SENDER_SCRIPT } }],
      outputs: [{ type: 'script', amount: 1n, script: SENDER_SCRIPT }],
    });
    const parsed = parsePsbtV2(hex);
    expect(parsed.inputs[0].witnessUtxo?.amount).toBe(amount);
    expect(bytesToHex(parsed.inputs[0].witnessUtxo!.script)).toBe(bytesToHex(SENDER_SCRIPT));
  });

  it('writes a default sequence of 0xfffffffd when none is supplied', () => {
    const hex = encodePsbtV2({
      inputs: [{ txid: TXID_A, vout: 0, witnessUtxo: { amount: 1n, script: SENDER_SCRIPT } }],
      outputs: [{ type: 'script', amount: 1n, script: SENDER_SCRIPT }],
    });
    const parsed = parsePsbtV2(hex);
    expect(parsed.inputs[0].sequence).toBe(0xfffffffd);
  });

  it('preserves a caller-supplied sequence', () => {
    const hex = encodePsbtV2({
      inputs: [
        {
          txid: TXID_A,
          vout: 0,
          sequence: 0xfffffffe,
          witnessUtxo: { amount: 1n, script: SENDER_SCRIPT },
        },
      ],
      outputs: [{ type: 'script', amount: 1n, script: SENDER_SCRIPT }],
    });
    const parsed = parsePsbtV2(hex);
    expect(parsed.inputs[0].sequence).toBe(0xfffffffe);
  });

  it('encodes a BIP-375 PSBT_OUT_SP_V0_INFO output without a PSBT_OUT_SCRIPT', () => {
    const hex = encodePsbtV2({
      inputs: [{ txid: TXID_A, vout: 0, witnessUtxo: { amount: 100_000n, script: SENDER_SCRIPT } }],
      outputs: [
        {
          type: 'sp',
          amount: 50_000n,
          scanPubKey: SCAN_PUBKEY,
          spendPubKey: SPEND_PUBKEY,
        },
      ],
    });

    const parsed = parsePsbtV2(hex);
    expect(parsed.outputs).toHaveLength(1);
    expect(parsed.outputs[0].amount).toBe(50_000n);
    // No script — the signer is meant to derive it.
    expect(parsed.outputs[0].script).toBeUndefined();
    // The BIP-375 SP_V0_INFO row (keytype 0x09) is preserved in `unknown`.
    const spInfo = parsed.outputs[0].unknown.find((u) => u.keyType === 0x09);
    expect(spInfo).toBeDefined();
    expect(spInfo!.value.length).toBe(67); // 1 version byte + 33 scan + 33 spend
    expect(spInfo!.value[0]).toBe(0); // version 0
    expect(bytesToHex(spInfo!.value.slice(1, 34))).toBe(bytesToHex(SCAN_PUBKEY));
    expect(bytesToHex(spInfo!.value.slice(34, 67))).toBe(bytesToHex(SPEND_PUBKEY));
  });

  it('emits a PSBT_OUT_SP_V0_LABEL row when a label is supplied', () => {
    const hex = encodePsbtV2({
      inputs: [{ txid: TXID_A, vout: 0, witnessUtxo: { amount: 100_000n, script: SENDER_SCRIPT } }],
      outputs: [
        {
          type: 'sp',
          amount: 50_000n,
          scanPubKey: SCAN_PUBKEY,
          spendPubKey: SPEND_PUBKEY,
          label: 7,
        },
      ],
    });
    const parsed = parsePsbtV2(hex);
    // BIP-375 PSBT_OUT_SP_V0_LABEL = 0x0a, value is a 32-bit LE uint.
    const labelRow = parsed.outputs[0].unknown.find((u) => u.keyType === 0x0a);
    expect(labelRow).toBeDefined();
    expect(labelRow!.value.length).toBe(4);
    expect(labelRow!.value[0]).toBe(7);
  });

  it('rejects inputs with the wrong tapInternalKey length', () => {
    expect(() =>
      encodePsbtV2({
        inputs: [
          {
            txid: TXID_A,
            vout: 0,
            witnessUtxo: { amount: 1n, script: SENDER_SCRIPT },
            tapInternalKey: new Uint8Array(31),
          },
        ],
        outputs: [{ type: 'script', amount: 1n, script: SENDER_SCRIPT }],
      }),
    ).toThrow(/32 bytes/i);
  });

  it('rejects SP outputs with the wrong scan/spend key length', () => {
    expect(() =>
      encodePsbtV2({
        inputs: [{ txid: TXID_A, vout: 0, witnessUtxo: { amount: 1n, script: SENDER_SCRIPT } }],
        outputs: [
          {
            type: 'sp',
            amount: 1n,
            scanPubKey: new Uint8Array(32),
            spendPubKey: SPEND_PUBKEY,
          },
        ],
      }),
    ).toThrow(/33 bytes/i);
  });

  it('round-trips multiple inputs and outputs in order', () => {
    const hex = encodePsbtV2({
      inputs: [
        { txid: TXID_A, vout: 0, witnessUtxo: { amount: 50_000n, script: SENDER_SCRIPT } },
        { txid: TXID_A, vout: 1, witnessUtxo: { amount: 75_000n, script: SENDER_SCRIPT } },
      ],
      outputs: [
        { type: 'sp', amount: 100_000n, scanPubKey: SCAN_PUBKEY, spendPubKey: SPEND_PUBKEY },
        { type: 'script', amount: 23_000n, script: SENDER_SCRIPT },
      ],
    });
    const parsed = parsePsbtV2(hex);
    expect(parsed.inputs).toHaveLength(2);
    expect(parsed.inputs[0].vout).toBe(0);
    expect(parsed.inputs[0].witnessUtxo?.amount).toBe(50_000n);
    expect(parsed.inputs[1].vout).toBe(1);
    expect(parsed.inputs[1].witnessUtxo?.amount).toBe(75_000n);
    expect(parsed.outputs).toHaveLength(2);
    expect(parsed.outputs[0].script).toBeUndefined();
    expect(parsed.outputs[0].amount).toBe(100_000n);
    expect(parsed.outputs[1].amount).toBe(23_000n);
    expect(bytesToHex(parsed.outputs[1].script!)).toBe(bytesToHex(SENDER_SCRIPT));
  });
});

describe('parsePsbtV2 error cases', () => {
  it('rejects input with bad magic bytes', () => {
    // 5-byte magic-shaped header that doesn't match `0x70 0x73 0x62 0x74 0xff`,
    // followed by a separator. The parser should reject before reading further.
    expect(() => parsePsbtV2('aabbccddee00')).toThrow(/magic/i);
  });

  it('rejects input shorter than the magic header', () => {
    expect(() => parsePsbtV2('7073')).toThrow(/truncated|magic/i);
  });

  it('rejects PSBT v0 (we only handle PSBT v2 in this codepath)', () => {
    // Magic plus an empty globals scope (just the separator). The parser
    // demands `PSBT_GLOBAL_VERSION = 2` to be present.
    expect(() => parsePsbtV2('70736274ff00')).toThrow(/PSBT v2/);
  });
});

describe('extractTxFromSignedPsbtV2', () => {
  it('produces a finalized raw transaction from a signed PSBT v2', () => {
    const unsigned = encodePsbtV2({
      inputs: [
        { txid: TXID_A, vout: 0, witnessUtxo: { amount: 100_000n, script: SENDER_SCRIPT } },
      ],
      outputs: [{ type: 'script', amount: 90_000n, script: SENDER_SCRIPT }],
    });
    const finalized = spliceFinalWitness(unsigned);
    const txHex = extractTxFromSignedPsbtV2(finalized);

    // Raw tx starts with a 4-byte LE version. We emitted txVersion=2.
    expect(txHex.slice(0, 8)).toBe('02000000');
    // SegWit marker+flag follows because we set finalScriptWitness.
    expect(txHex.slice(8, 12)).toBe('0001');
    // The 90_000-sat output amount encoded as LE u64: `905f010000000000`.
    expect(txHex).toContain('905f010000000000');
  });

  it('refuses to extract if an output is still missing a script (BIP-375 unresolved)', () => {
    // Build a PSBT v2 with a finalized input but the SP output left blank —
    // the extractor must reject because BIP-375 requires the signer to
    // derive the silent-payment script before we can broadcast.
    const unsigned = encodePsbtV2({
      inputs: [{ txid: TXID_A, vout: 0, witnessUtxo: { amount: 1n, script: SENDER_SCRIPT } }],
      outputs: [
        { type: 'sp', amount: 1n, scanPubKey: SCAN_PUBKEY, spendPubKey: SPEND_PUBKEY },
      ],
    });
    const withWitness = spliceFinalWitness(unsigned);
    expect(() => extractTxFromSignedPsbtV2(withWitness)).toThrow(/scriptPubKey|silent payment/i);
  });

  it('refuses to extract if an input has neither scriptSig nor witness', () => {
    const unsigned = encodePsbtV2({
      inputs: [{ txid: TXID_A, vout: 0, witnessUtxo: { amount: 1n, script: SENDER_SCRIPT } }],
      outputs: [{ type: 'script', amount: 1n, script: SENDER_SCRIPT }],
    });
    expect(() => extractTxFromSignedPsbtV2(unsigned)).toThrow(/not finalized/i);
  });
});

/**
 * Splice a `PSBT_IN_FINAL_SCRIPTWITNESS` row (keytype 0x08) onto the first
 * input of a PSBT v2 hex blob, simulating a signer that has finalized the
 * input. The witness payload is a single 64-byte zero signature — invalid
 * cryptographically, fine for round-tripping the extractor.
 */
function spliceFinalWitness(unsignedHex: string): string {
  const bytes = hexToBytes(unsignedHex);
  // Walk past magic + globals scope.
  let offset = 5;
  while (bytes[offset] !== 0) {
    const klen = bytes[offset];
    offset += 1 + klen;
    const vlen = bytes[offset];
    offset += 1 + vlen;
  }
  offset += 1; // skip globals separator

  // Walk to the first input's separator.
  while (bytes[offset] !== 0) {
    const klen = bytes[offset];
    offset += 1 + klen;
    const firstValByte = bytes[offset];
    let vlenSize = 1;
    let vlen = firstValByte;
    if (firstValByte === 0xfd) {
      vlen = bytes[offset + 1] | (bytes[offset + 2] << 8);
      vlenSize = 3;
    }
    offset += vlenSize + vlen;
  }

  // Splice in PSBT_IN_FINAL_SCRIPTWITNESS:
  //   key   = compact-size(1) || 0x08
  //   value = compact-size(N)  || witness bytes
  // Witness bytes: compact-size(item count=1) || compact-size(64) || 64 zero bytes.
  const witnessValue = hexToBytes('01' + '40' + '00'.repeat(64));
  const insert = new Uint8Array(2 + 1 + witnessValue.length);
  insert[0] = 0x01;
  insert[1] = 0x08;
  insert[2] = witnessValue.length;
  insert.set(witnessValue, 3);

  const out = new Uint8Array(bytes.length + insert.length);
  out.set(bytes.subarray(0, offset), 0);
  out.set(insert, offset);
  out.set(bytes.subarray(offset), offset + insert.length);
  return bytesToHex(out);
}
