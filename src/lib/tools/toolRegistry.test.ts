import { describe, it, expect, vi } from 'vitest';
import type { NPool } from '@nostrify/nostrify';

import {
  createBaseToolBundle,
  createNostrLookupToolBundle,
  buildSessionToolBundle,
} from './toolRegistry';

const BASE_NAMES = ['set_theme', 'search_nips', 'fetch_nip', 'ask_questions'];

/** A nostr client stub; the bundles never query it at construction. */
const mockNostr = { query: async () => [] } as unknown as NPool;

const NOSTR_LOOKUP_NAMES = ['nak'];

describe('createBaseToolBundle', () => {
  it('contains the always-on base tools in order', () => {
    const bundle = createBaseToolBundle({ applyCustomTheme: () => {} });
    expect(bundle.map((b) => b.name)).toEqual(BASE_NAMES);
    expect(bundle[0].tool.inputSchema).toBeDefined();
  });

  it('includes the NIP lookup tools', () => {
    const bundle = createBaseToolBundle({ applyCustomTheme: () => {} });
    const names = bundle.map((b) => b.name);
    expect(names).toContain('search_nips');
    expect(names).toContain('fetch_nip');
  });

  it('does not include the nak tool in the always-on base bundle', () => {
    const bundle = createBaseToolBundle({ applyCustomTheme: () => {} });
    expect(bundle.map((b) => b.name)).not.toContain('nak');
  });

  it('binds the tool to the supplied applyCustomTheme closure', async () => {
    const apply = vi.fn();
    const [entry] = createBaseToolBundle({ applyCustomTheme: apply });

    await entry.tool.execute({
      background: '0 0% 100%',
      text: '0 0% 10%',
      primary: '142 70% 45%',
    });

    expect(apply).toHaveBeenCalled();
  });
});

describe('createNostrLookupToolBundle', () => {
  it('contains the nak tool wired to the supplied relay pool', () => {
    const bundle = createNostrLookupToolBundle({ nostr: mockNostr });
    expect(bundle.map((b) => b.name)).toEqual(NOSTR_LOOKUP_NAMES);
    const nak = bundle.find((b) => b.name === 'nak')!;
    expect(nak.tool.inputSchema).toBeDefined();
    expect(nak.tool.description).toContain('nostr');
  });
});

describe('buildSessionToolBundle', () => {
  it('returns only the base bundle for a session with no abilities', () => {
    const base = createBaseToolBundle({ applyCustomTheme: () => {} });
    const result = buildSessionToolBundle({ base, abilities: [] });
    expect(result.map((b) => b.name)).toEqual(BASE_NAMES);
  });

  it('includes the NIP lookup tools for any ability selection', () => {
    const base = createBaseToolBundle({ applyCustomTheme: () => {} });
    const results = [
      buildSessionToolBundle({ base, abilities: [] }),
      buildSessionToolBundle({ base, abilities: ['nostr-lookup'], nostr: mockNostr }),
    ];
    for (const result of results) {
      const names = result.map((b) => b.name);
      expect(names).toContain('search_nips');
      expect(names).toContain('fetch_nip');
    }
  });

  it('adds the nak tool only for a nostr-lookup session', () => {
    const base = createBaseToolBundle({ applyCustomTheme: () => {} });
    const result = buildSessionToolBundle({
      base,
      abilities: ['nostr-lookup'],
      nostr: mockNostr,
    });
    expect(result.map((b) => b.name)).toEqual([...BASE_NAMES, ...NOSTR_LOOKUP_NAMES]);
    // A session without the ability gets no nak: the ability is opt-in.
    const plainResult = buildSessionToolBundle({ base, abilities: [] });
    expect(plainResult.map((b) => b.name)).not.toContain('nak');
  });

  it('throws when a nostr-lookup session is built without a relay pool', () => {
    const base = createBaseToolBundle({ applyCustomTheme: () => {} });
    expect(() =>
      buildSessionToolBundle({ base, abilities: ['nostr-lookup'] }),
    ).toThrow(/requires a nostr relay pool/);
  });

  it('does not mutate the base array when concatenating', () => {
    const base = createBaseToolBundle({ applyCustomTheme: () => {} });
    buildSessionToolBundle({ base, abilities: ['nostr-lookup'], nostr: mockNostr });
    expect(base.map((b) => b.name)).toEqual(BASE_NAMES);
  });
});
