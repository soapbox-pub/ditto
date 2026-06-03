/**
 * BIP352 silent payment sender tests.
 *
 * Validates {@link deriveSilentPaymentOutputs} and
 * {@link decodeSilentPaymentAddress} against the canonical
 * `send_and_receive_test_vectors.json` from
 * `https://github.com/bitcoin/bips/tree/master/bip-0352`.
 *
 * Each vector ships an input set and expected taproot output x-only keys. We
 * compare them as a SET (the BIP352 reference orders outputs by amount;
 * amounts aren't part of the vectors so the JSON provides every permutation
 * as an acceptable answer).
 */
import { describe, expect, it } from 'vitest';
import { pubECDSA } from '@scure/btc-signer/utils.js';
import { Buffer } from 'buffer';

import {
  decodeSilentPaymentAddress,
  deriveSilentPaymentOutputs,
  extractEligibleInputPubKey,
  isSilentPaymentAddress,
  type SilentPaymentInput,
  type SilentPaymentRecipient,
} from './silentPayments';

import vectors from '../test/fixtures/bip352_sender_vectors.json';

// ---------------------------------------------------------------------------
// Type for the slimmed-down vector fixture
// ---------------------------------------------------------------------------

interface VinJSON {
  txid: string;
  vout: number;
  scriptSig: { hex: string };
  /**
   * Serialized witness stack: 1 byte stack-item count, then per item a
   * varint length prefix followed by the raw bytes. May be empty string.
   */
  txinwitness: string;
  prevout: { scriptPubKey: { hex: string } };
  private_key: string;
}

interface RecipientJSON {
  address: string;
  scan_pub_key: string;
  spend_pub_key: string;
  count?: number;
}

interface SendingCase {
  given: { vin: VinJSON[]; recipients: RecipientJSON[] };
  expected: { outputs: string[][]; n_outputs: number };
}

interface TestCaseJSON {
  comment: string;
  sending: SendingCase[];
}

const cases = vectors as TestCaseJSON[];

// ---------------------------------------------------------------------------
// Witness parser — vectors store the witness as a single hex blob
// ---------------------------------------------------------------------------

/**
 * Parse a serialized witness from the test vector format. Witnesses there are:
 *
 *   <varint nstackitems> ( <varint length> <bytes> )*
 *
 * Returns an empty array for the empty witness.
 */
function parseWitness(hex: string): Uint8Array[] {
  if (!hex) return [];
  const buf = Buffer.from(hex, 'hex');
  let off = 0;

  function readVarInt(): number {
    if (off >= buf.length) throw new Error('witness: short varint');
    const first = buf[off++];
    if (first < 0xfd) return first;
    if (first === 0xfd) {
      const v = buf.readUInt16LE(off);
      off += 2;
      return v;
    }
    if (first === 0xfe) {
      const v = buf.readUInt32LE(off);
      off += 4;
      return v;
    }
    // 0xff: 8-byte; not expected in witnesses, but parse anyway.
    const lo = buf.readUInt32LE(off);
    const hi = buf.readUInt32LE(off + 4);
    off += 8;
    if (hi !== 0) throw new Error('witness: varint too large');
    return lo;
  }

  const count = readVarInt();
  const out: Uint8Array[] = [];
  for (let i = 0; i < count; i++) {
    const len = readVarInt();
    if (off + len > buf.length) throw new Error('witness: short item');
    out.push(new Uint8Array(buf.subarray(off, off + len)));
    off += len;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Build SilentPaymentInput[] from a vector's vins.
// ---------------------------------------------------------------------------

/**
 * Walks the vector's inputs, filters to BIP352-eligible ones, and returns a
 * `SilentPaymentInput[]` ready for `deriveSilentPaymentOutputs`. Non-eligible
 * inputs (and inputs whose extracted pubkey doesn't match the provided
 * private key) are dropped — exactly the behaviour the spec requires.
 */
function buildEligibleInputs(vins: VinJSON[]): SilentPaymentInput[] {
  const eligible: SilentPaymentInput[] = [];

  for (const vin of vins) {
    const witness = parseWitness(vin.txinwitness);
    const extracted = extractEligibleInputPubKey(
      vin.prevout.scriptPubKey.hex,
      vin.scriptSig.hex,
      witness,
    );
    if (!extracted) continue;

    // Cross-check: derive the pubkey from the private key (with parity rules)
    // and compare to what extractEligibleInputPubKey saw on-chain.
    const privKey = new Uint8Array(Buffer.from(vin.private_key, 'hex'));
    let pub: Uint8Array;
    try {
      pub = pubECDSA(privKey, true);
    } catch {
      continue;
    }

    if (extracted.isTaproot) {
      // Compare x-only (extracted has been forced to 0x02 prefix).
      const extractedX = extracted.pubkey.subarray(1);
      const pubX = pub.subarray(1);
      if (!Buffer.from(extractedX).equals(Buffer.from(pubX))) {
        // The vector's private key doesn't correspond to the on-chain
        // taproot key. Skip — this exercises the "non-eligible" rule.
        continue;
      }
    } else {
      // Non-taproot: full 33-byte compressed key comparison, but the
      // extracted pubkey may have different parity from `pub` only if the
      // vector is malformed.
      if (!Buffer.from(extracted.pubkey).equals(Buffer.from(pub))) continue;
    }

    eligible.push({
      txid: vin.txid,
      vout: vin.vout,
      privateKey: privKey,
      pubkey: extracted.pubkey,
      isTaproot: extracted.isTaproot,
    });
  }
  return eligible;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('decodeSilentPaymentAddress', () => {
  it('decodes the canonical "sp1qqgste7k9hx0qftg6qmwlkqtwuy6cycyavzmzj85c6qdf…" vector', () => {
    const addr = decodeSilentPaymentAddress(
      'sp1qqgste7k9hx0qftg6qmwlkqtwuy6cycyavzmzj85c6qdfhjdpdjtdgqjuexzk6murw56suy3e0rd2cgqvycxttddwsvgxe2usfpxumr70xc9pkqwv',
    );
    expect(addr.hrp).toBe('sp');
    expect(addr.network).toBe('mainnet');
    expect(addr.version).toBe(0);
    expect(Buffer.from(addr.scanPubKey).toString('hex')).toBe(
      '0220bcfac5b99e04ad1a06ddfb016ee13582609d60b6291e98d01a9bc9a16c96d4',
    );
    expect(Buffer.from(addr.spendPubKey).toString('hex')).toBe(
      '025cc9856d6f8375350e123978daac200c260cb5b5ae83106cab90484dcd8fcf36',
    );
  });

  it('round-trips scan and spend keys for every vector recipient', () => {
    for (const tc of cases) {
      for (const s of tc.sending) {
        for (const r of s.given.recipients) {
          const decoded = decodeSilentPaymentAddress(r.address);
          expect(Buffer.from(decoded.scanPubKey).toString('hex')).toBe(
            r.scan_pub_key,
          );
          expect(Buffer.from(decoded.spendPubKey).toString('hex')).toBe(
            r.spend_pub_key,
          );
        }
      }
    }
  });

  it('rejects mixed-case', () => {
    expect(() =>
      decodeSilentPaymentAddress(
        'Sp1QQGSTE7K9HX0QFTG6QMWLKQTWUY6CYCYAVZMZJ85C6QDFHJDPDJTDGQJUEXZK6MURW56SUY3E0RD2CGQVYCXTTDDWSVGXE2USFPXUMR70XC9PKQWV',
      ),
    ).toThrow(/mixed case/);
  });

  it('rejects bad checksum', () => {
    expect(() =>
      decodeSilentPaymentAddress(
        // Last char of valid vector flipped from "v" to "x"
        'sp1qqgste7k9hx0qftg6qmwlkqtwuy6cycyavzmzj85c6qdfhjdpdjtdgqjuexzk6murw56suy3e0rd2cgqvycxttddwsvgxe2usfpxumr70xc9pkqwx',
      ),
    ).toThrow(/checksum/);
  });

  it('rejects unknown HRP', () => {
    // Reuse the data part of a real vector but swap the HRP. The checksum is
    // HRP-dependent so this will also fail checksum; we expect a thrown error
    // either way (the HRP-unknown branch is checked before the checksum).
    expect(() =>
      decodeSilentPaymentAddress(
        'bc1qqgste7k9hx0qftg6qmwlkqtwuy6cycyavzmzj85c6qdfhjdpdjtdgqjuexzk6murw56suy3e0rd2cgqvycxttddwsvgxe2usfpxumr70xc9pkqwv',
      ),
    ).toThrow();
  });

  it('isSilentPaymentAddress accepts sp1/tsp1 prefixes only', () => {
    expect(isSilentPaymentAddress('sp1q…')).toBe(true);
    expect(isSilentPaymentAddress('SP1q…')).toBe(true);
    expect(isSilentPaymentAddress('tsp1q…')).toBe(true);
    expect(isSilentPaymentAddress('bc1q…')).toBe(false);
    expect(isSilentPaymentAddress('')).toBe(false);
  });
});

describe('extractEligibleInputPubKey', () => {
  it('returns null for an unrecognized scriptPubKey', () => {
    // OP_RETURN
    expect(extractEligibleInputPubKey('6a00', '', [])).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// BIP352 vector tests — every send vector
// ---------------------------------------------------------------------------
//
// Each vector is run as its own `it` so failures point at the specific case.

for (let i = 0; i < cases.length; i++) {
  const tc = cases[i];
  describe(`BIP352 vector ${i}: ${tc.comment}`, () => {
    for (let j = 0; j < tc.sending.length; j++) {
      const s = tc.sending[j];
      it(`produces a valid output set (sending[${j}])`, () => {
        const inputs = buildEligibleInputs(s.given.vin);

        // BIP352 takes outpoint_L over ALL inputs of the tx, including ones
        // that don't contribute a pubkey (e.g. NUMS-H taproot script-paths,
        // P2PKH with uncompressed keys). Pass them through separately.
        const allOutpoints = s.given.vin.map((v) => ({ txid: v.txid, vout: v.vout }));

        // Expand `count` per the BIP352 reference (`recipients.extend([r] * count)`).
        const recipients: SilentPaymentRecipient[] = [];
        for (const r of s.given.recipients) {
          const count = r.count ?? 1;
          for (let n = 0; n < count; n++) {
            recipients.push({ address: decodeSilentPaymentAddress(r.address), raw: r.address });
          }
        }

        if (s.expected.n_outputs === 0) {
          // Sender must fail (empty input set, all-zero a, K_max exceeded, …).
          // Either deriveSilentPaymentOutputs throws, or — in the "no
          // eligible inputs" case — we never call it because `inputs` is
          // empty. Both modes are accepted.
          if (inputs.length === 0) {
            // Nothing to derive; matches the "no eligible inputs" vector.
            return;
          }
          expect(() =>
            deriveSilentPaymentOutputs(inputs, recipients, { allOutpoints }),
          ).toThrow();
          return;
        }

        const outputs = deriveSilentPaymentOutputs(inputs, recipients, { allOutpoints });
        expect(outputs).toHaveLength(s.expected.n_outputs);

        const producedSet = new Set(
          outputs.map((o) => Buffer.from(o.xOnlyPubKey).toString('hex')),
        );

        // Any of the acceptable output sets is a pass.
        const matches = s.expected.outputs.some((set) => {
          if (set.length !== producedSet.size) return false;
          for (const x of set) {
            if (!producedSet.has(x)) return false;
          }
          return true;
        });
        if (!matches) {
          // Surface a useful diff in the failure message.
          throw new Error(
            `Produced output set ${JSON.stringify(
              [...producedSet],
            )} does not match any of the ${s.expected.outputs.length} acceptable sets. First acceptable: ${JSON.stringify(s.expected.outputs[0])}`,
          );
        }
      });
    }
  });
}

// ---------------------------------------------------------------------------
// New BIP-375 helpers
// ---------------------------------------------------------------------------

import {
  aggregateSenderPrivateKey,
  computeBip375EcdhShare,
  deriveSPOutputScriptFromShare,
  encodeSilentPaymentAddress,
  p2trScriptPubKey,
} from './silentPayments';

describe('encodeSilentPaymentAddress', () => {
  it('round-trips against decodeSilentPaymentAddress', () => {
    type V = { sending: Array<{ given: { recipients: Array<{ address: string }> } }> };
    for (const v of vectors as unknown as V[]) {
      for (const s of v.sending) {
        for (const r of s.given.recipients) {
          const decoded = decodeSilentPaymentAddress(r.address);
          // Skip labelled addresses (m != 0 not in our scope) — we still
          // re-encode them faithfully because we only know `Bm`.
          const re = encodeSilentPaymentAddress({
            network: decoded.network,
            version: decoded.version,
            scanPubKey: decoded.scanPubKey,
            spendPubKey: decoded.spendPubKey,
          });
          expect(re.toLowerCase()).toBe(r.address.toLowerCase());
        }
      }
    }
  });

  it('produces uppercase-safe output for known addresses', () => {
    // Decode-then-encode of a known mainnet address.
    const sample =
      'sp1qqgste7k9hx0qftg6qmwlkqtwuy6cycyavzmzj85c6qdfhjdpdjtdgqjuexzk6murw56suy3e0rd2cgqvycxttddwsvgxe2usfpxumr70xc9pkqwv';
    const decoded = decodeSilentPaymentAddress(sample);
    const re = encodeSilentPaymentAddress({
      network: decoded.network,
      version: decoded.version,
      scanPubKey: decoded.scanPubKey,
      spendPubKey: decoded.spendPubKey,
    });
    expect(re).toBe(sample);
  });
});

describe('p2trScriptPubKey', () => {
  it('produces the OP_1 push32 encoding', () => {
    const x = new Uint8Array(32);
    for (let i = 0; i < 32; i++) x[i] = i;
    const spk = p2trScriptPubKey(x);
    expect(spk.length).toBe(34);
    expect(spk[0]).toBe(0x51);
    expect(spk[1]).toBe(0x20);
    expect(spk.slice(2)).toEqual(x);
  });

  it('rejects non-32-byte inputs', () => {
    expect(() => p2trScriptPubKey(new Uint8Array(33))).toThrow();
  });
});

describe('aggregateSenderPrivateKey + ECDH share + output derivation', () => {
  it('matches deriveSilentPaymentOutputs for a real BIP-352 vector', () => {
    // Pull a vector that has exactly one eligible input and one recipient.
    type SVec = {
      sending: Array<{
        given: {
          vin: Array<{
            private_key: string;
            prevout: { scriptPubKey: { hex: string } };
          }>;
          recipients: Array<{ address: string; count?: number }>;
        };
        expected: { outputs: string[][]; n_outputs: number };
      }>;
    };
    const allVecs = vectors as unknown as SVec[];
    const matching = allVecs.find((v) =>
      v.sending.some(
        (s) =>
          s.given.vin.length === 1 &&
          s.given.recipients.length === 1 &&
          (s.given.recipients[0].count ?? 1) === 1 &&
          // Restrict to P2TR (0x51 0x20 ...) inputs for simplicity.
          s.given.vin[0].prevout.scriptPubKey.hex.startsWith('5120'),
      ),
    );
    if (!matching) {
      // Not all vectors have this shape; bail silently if none match.
      return;
    }
    const s = matching.sending.find(
      (x) =>
        x.given.vin.length === 1 &&
        x.given.recipients.length === 1 &&
        (x.given.recipients[0].count ?? 1) === 1 &&
        x.given.vin[0].prevout.scriptPubKey.hex.startsWith('5120'),
    )!;

    const vin = s.given.vin[0];
    const decoded = decodeSilentPaymentAddress(s.given.recipients[0].address);

    // We don't have the txid/vout here in this slimmed fixture; just use a
    // deterministic one — the test below compares the new pipeline against
    // the legacy pipeline using the same txid/vout.
    const txid =
      '0000000000000000000000000000000000000000000000000000000000000001';
    const vout = 0;

    const input: SilentPaymentInput = {
      txid,
      vout,
      privateKey: Buffer.from(vin.private_key, 'hex'),
      isTaproot: true,
    };
    const recipients: SilentPaymentRecipient[] = [{ address: decoded }];

    const legacy = deriveSilentPaymentOutputs([input], recipients);
    expect(legacy.length).toBe(1);

    // New pipeline: aggregate, ECDH share, derive.
    const agg = aggregateSenderPrivateKey([input]);
    const share = computeBip375EcdhShare(agg.aggregateScalar, decoded.scanPubKey);
    const xonly = deriveSPOutputScriptFromShare({
      ecdhShare: share,
      inputHash: agg.inputHash,
      spendPubKey: decoded.spendPubKey,
      k: 0,
    });
    expect(Buffer.from(xonly).toString('hex')).toBe(
      Buffer.from(legacy[0].xOnlyPubKey).toString('hex'),
    );
  });
});
