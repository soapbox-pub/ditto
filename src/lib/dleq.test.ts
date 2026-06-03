/**
 * BIP-374 DLEQ proof tests.
 *
 * Validates {@link generateDLEQProof} and {@link verifyDLEQProof} against
 * the canonical test vectors from
 * `https://github.com/bitcoin/bips/tree/master/bip-0374`.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { Buffer } from 'buffer';

import { generateDLEQProof, verifyDLEQProof } from './dleq';

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = resolve(here, '../test/fixtures');

function parseCsv(path: string): Array<Record<string, string>> {
  const raw = readFileSync(resolve(fixtures, path), 'utf8');
  const lines = raw.split(/\r?\n/).filter((l) => l.length > 0);
  const header = lines[0].split(',');
  return lines.slice(1).map((line) => {
    // The CSVs have no quoted fields with commas, so a simple split works.
    const cells = line.split(',');
    const row: Record<string, string> = {};
    for (let i = 0; i < header.length; i++) {
      row[header[i]] = cells[i] ?? '';
    }
    return row;
  });
}

function hex(s: string): Uint8Array {
  return Uint8Array.from(Buffer.from(s, 'hex'));
}

describe('BIP-374 GenerateProof vectors', () => {
  const rows = parseCsv('bip374_generate_proof.csv');

  for (const row of rows) {
    const isInvalid = row.result_proof === 'INVALID';
    const label = `vector ${row.index}: ${row.comment}`;

    it(label, () => {
      const G = hex(row.point_G);
      const a = hex(row.scalar_a);
      const auxRand = hex(row.auxrand_r);
      const message = row.message ? hex(row.message) : undefined;

      // The "B = INFINITY" failure vector uses a literal string instead of
      // hex; map it to bytes that our impl will reject.
      const isBInfinity = row.point_B === 'INFINITY';
      const B = isBInfinity ? new Uint8Array(33) : hex(row.point_B);

      const callGenerate = () =>
        generateDLEQProof({
          a,
          B,
          auxRand,
          G,
          message,
        });

      if (isInvalid) {
        expect(callGenerate).toThrow();
      } else {
        const { proof } = callGenerate();
        expect(Buffer.from(proof).toString('hex')).toBe(row.result_proof);
      }
    });
  }
});

describe('BIP-374 VerifyProof vectors', () => {
  const rows = parseCsv('bip374_verify_proof.csv');

  for (const row of rows) {
    const expected = row.result_success === 'TRUE';
    const label = `vector ${row.index}: ${row.comment}`;

    it(label, () => {
      const G = hex(row.point_G);
      const A = hex(row.point_A);
      const B = hex(row.point_B);
      const C = hex(row.point_C);
      const proof = hex(row.proof);
      const message = row.message ? hex(row.message) : undefined;

      const ok = verifyDLEQProof({ A, B, C, proof, G, message });
      expect(ok).toBe(expected);
    });
  }
});

describe('BIP-374 round-trip', () => {
  it('generates and verifies a proof using the standard generator', () => {
    const a = hex('1111111111111111111111111111111111111111111111111111111111111111');
    const B = hex('0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798');
    const auxRand = hex('2222222222222222222222222222222222222222222222222222222222222222');

    const { proof, A, C } = generateDLEQProof({ a, B, auxRand });

    expect(proof.length).toBe(64);
    expect(verifyDLEQProof({ A, B, C, proof })).toBe(true);
  });

  it('rejects a tampered proof', () => {
    const a = hex('1111111111111111111111111111111111111111111111111111111111111111');
    const B = hex('0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798');
    const auxRand = hex('2222222222222222222222222222222222222222222222222222222222222222');

    const { proof, A, C } = generateDLEQProof({ a, B, auxRand });
    const tampered = new Uint8Array(proof);
    tampered[10] ^= 0x01;

    expect(verifyDLEQProof({ A, B, C, proof: tampered })).toBe(false);
  });
});
