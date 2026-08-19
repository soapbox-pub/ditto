import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';

import { estimateFee, getFeeRates, type FeeRates } from '@/lib/esploraApi';
import { _resetEsploraStateForTests } from '@/lib/esplora';

const API = ['https://esplora.example/api'];

/** Stub `fetch` so `/fee-estimates` returns `body` verbatim. */
function stubFeeEstimates(body: unknown): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    ),
  );
}

function everyRate(rates: FeeRates): number[] {
  return [rates.fastestFee, rates.halfHourFee, rates.hourFee, rates.economyFee, rates.minimumFee];
}

describe('getFeeRates', () => {
  beforeEach(() => {
    _resetEsploraStateForTests();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reads plain numeric estimates', async () => {
    stubFeeEstimates({ '1': 12, '3': 8, '6': 5, '144': 2, '504': 1 });
    const rates = await getFeeRates(API);
    expect(everyRate(rates)).toEqual([12, 8, 5, 2, 1]);
  });

  it('rounds fractional rates up', async () => {
    stubFeeEstimates({ '1': 12.1, '3': 8.9 });
    const rates = await getFeeRates(API);
    expect(rates.fastestFee).toBe(13);
    expect(rates.halfHourFee).toBe(9);
  });

  // The reported attack: a hostile or merely version-mismatched endpoint
  // returns fee estimates in a different JSON shape. Every value below is
  // truthy but not a number, so `Math.ceil(data['1'] || 1)` produced NaN —
  // which passed every downstream `<` / `>=` guard, dropped the change output,
  // and left the wallet's entire balance to miners while the UI showed "Fee 0".
  const hostile: Array<[string, unknown]> = [
    ['objects', { '1': { fee: 5 }, '3': { fee: 5 }, '6': { fee: 5 }, '144': { fee: 5 }, '504': { fee: 5 } }],
    ['strings', { '1': '5', '3': '5', '6': '5', '144': '5', '504': '5' }],
    ['arrays', { '1': [], '3': [5], '6': [], '144': [], '504': [] }],
    ['booleans', { '1': true, '3': true, '6': true, '144': true, '504': true }],
    ['nulls', { '1': null, '3': null, '6': null, '144': null, '504': null }],
    ['nothing at all', {}],
    ['a JSON array', []],
    ['a JSON string', 'nope'],
    ['null', null],
  ];

  for (const [label, body] of hostile) {
    it(`returns usable rates when the endpoint answers with ${label}`, async () => {
      stubFeeEstimates(body);
      const rates = await getFeeRates(API);
      for (const rate of everyRate(rates)) {
        expect(Number.isFinite(rate)).toBe(true);
        expect(rate).toBeGreaterThanOrEqual(1);
      }
    });
  }

  it('floors non-positive and negative rates at 1', async () => {
    stubFeeEstimates({ '1': 0, '3': -5, '6': 0.2 });
    const rates = await getFeeRates(API);
    expect(rates.fastestFee).toBe(1);
    expect(rates.halfHourFee).toBe(1);
    expect(rates.hourFee).toBe(1);
  });

  it('caps implausibly large rates', async () => {
    stubFeeEstimates({ '1': 1e9 });
    const rates = await getFeeRates(API);
    expect(rates.fastestFee).toBeLessThanOrEqual(5_000);
  });
});

describe('estimateFee', () => {
  it('computes a fee for a sane rate', () => {
    expect(estimateFee(1, 2, 5)).toBeGreaterThan(0);
  });

  it('throws rather than returning NaN for a non-finite rate', () => {
    expect(() => estimateFee(2, 2, NaN)).toThrow(/fee rate/i);
    expect(() => estimateFee(2, 2, Infinity)).toThrow(/fee rate/i);
  });

  it('throws for a rate below the 1 sat/vB relay floor', () => {
    expect(() => estimateFee(2, 2, 0)).toThrow(/fee rate/i);
    expect(() => estimateFee(2, 2, -1)).toThrow(/fee rate/i);
  });
});
