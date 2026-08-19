import { describe, it, expect } from 'vitest';

import { assertInvoiceAmount, decodeBolt11, invoiceCommitsTo } from './bolt11';

// BOLT 11 specification test vectors.
/** 2500u = 250,000,000 msat, with a plain-text description. */
const INVOICE_2500U =
  'lnbc2500u1pvjluezpp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypq' +
  'dq5xysxxatsyp3k7enxv4jsxqzpuaztrnwngzn3kdzw5hydlzf03qdgm2hdq27cqv3agm2aw' +
  'hz5se903vruatfhq77w3ls4evs3ch9zw97j25emudupq63nyw24cg27h2rspfj9srp';

/** No amount in the human-readable part — the payer or payee picks the sum. */
const INVOICE_AMOUNTLESS =
  'lnbc1pvjluezpp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypqdpl2p' +
  'kx2ctnv5sxxmmwwd5kgetjypeh2ursdae8g6twvus8g6rfwvs8qun0dfjkxaq8rkx3yf5tcs' +
  'yz3d73gafnh3cax9rn449d9p5uxz9ezhhypd0elx87sjle52x86fux2ypatgddc6k63n7erq' +
  'z25le42c4u4ecky03ylcqca784w';

/** 20m = 2,000,000,000 msat, carrying a description hash rather than text. */
const INVOICE_20M_WITH_HASH =
  'lnbc20m1pvjluezpp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypqhp' +
  '58yjmdan79s6qqdhdzgynm4zwqd5d7xmw5fk98klysy043l2ahrqscc6gd6ql3jrc5yzme8v' +
  '4ntcewwz5cnw92tz0pc8qcuufvq7khhr8wpald05e92xw006sq94mg8v2ndf4sefvf9sygks' +
  'hp5zfem29trqq2yxxz7';

/** The string whose sha256 is the description hash in {@link INVOICE_20M_WITH_HASH}. */
const HASHED_DESCRIPTION =
  'One piece of chocolate cake, one icecream cone, one pickle, one slice of swiss cheese, ' +
  'one slice of salami, one lollypop, one piece of cherry pie, one sausage, one cupcake, ' +
  'and one slice of watermelon';

describe('decodeBolt11', () => {
  it('decodes the amount from the human-readable part', () => {
    expect(decodeBolt11(INVOICE_2500U).amountMsat).toBe(250_000_000);
    expect(decodeBolt11(INVOICE_20M_WITH_HASH).amountMsat).toBe(2_000_000_000);
  });

  it('reports an amountless invoice as null rather than zero', () => {
    expect(decodeBolt11(INVOICE_AMOUNTLESS).amountMsat).toBeNull();
  });

  it('reads the network, timestamp and payment hash', () => {
    const decoded = decodeBolt11(INVOICE_2500U);
    expect(decoded.network).toBe('bc');
    expect(decoded.timestamp).toBe(1496314658);
    expect(decoded.paymentHash).toBe(
      '0001020304050607080900010203040506070809000102030405060708090102',
    );
  });

  it('reads the plain-text description', () => {
    expect(decodeBolt11(INVOICE_2500U).description).toBe('1 cup coffee');
  });

  it('reads the description hash', () => {
    expect(decodeBolt11(INVOICE_20M_WITH_HASH).descriptionHash).toHaveLength(64);
  });

  it('tolerates a lightning: URI prefix, whitespace and uppercase', () => {
    expect(decodeBolt11(`  LIGHTNING:${INVOICE_2500U.toUpperCase()}  `).amountMsat).toBe(250_000_000);
  });

  it('rejects a string that is not an invoice', () => {
    expect(() => decodeBolt11('not-an-invoice')).toThrow();
    expect(() => decodeBolt11('')).toThrow();
  });

  it('rejects an invoice whose checksum has been tampered with', () => {
    // Flip the last character of the bech32 checksum.
    const tampered = INVOICE_2500U.slice(0, -1) + (INVOICE_2500U.endsWith('p') ? 'q' : 'p');
    expect(() => decodeBolt11(tampered)).toThrow();
  });
});

describe('assertInvoiceAmount', () => {
  it('accepts an invoice for exactly the requested amount', () => {
    expect(assertInvoiceAmount(INVOICE_2500U, 250_000_000).amountMsat).toBe(250_000_000);
  });

  it('rejects an invoice for more than was requested', () => {
    // The reported attack: the user approves 776 sats and the recipient's own
    // LNURL server answers with an invoice for 5,000,000 sats.
    expect(() => assertInvoiceAmount(INVOICE_2500U, 776_000)).toThrow(/250000 sats.*776 sats/);
  });

  it('rejects an invoice for less than was requested', () => {
    expect(() => assertInvoiceAmount(INVOICE_2500U, 250_000_001)).toThrow();
  });

  it('rejects an amountless invoice, which would let the wallet pick the sum', () => {
    expect(() => assertInvoiceAmount(INVOICE_AMOUNTLESS, 250_000_000)).toThrow(/no amount/);
  });

  it('rejects an unparseable invoice rather than passing it through', () => {
    expect(() => assertInvoiceAmount('lnbc-garbage', 1000)).toThrow(/unreadable/);
  });
});

describe('invoiceCommitsTo', () => {
  it('accepts an invoice whose description hash matches a candidate', () => {
    const decoded = decodeBolt11(INVOICE_20M_WITH_HASH);
    expect(invoiceCommitsTo(decoded, ['something else', HASHED_DESCRIPTION])).toBe(true);
  });

  it('rejects an invoice bound to a different request', () => {
    const decoded = decodeBolt11(INVOICE_20M_WITH_HASH);
    expect(invoiceCommitsTo(decoded, ['a different zap request'])).toBe(false);
  });

  it('accepts an invoice with no description hash at all', () => {
    // Many providers use a plain `d` description; the amount check is what
    // stops an overcharge, this is only defence in depth.
    expect(invoiceCommitsTo(decodeBolt11(INVOICE_2500U), ['anything'])).toBe(true);
  });
});
