import { describe, it, expect, vi } from 'vitest';
import type { NPool } from '@nostrify/nostrify';

import {
  createBaseToolBundle,
  createNostrLookupToolBundle,
  buildSessionToolBundle,
} from './toolRegistry';

const BASE_NAMES = ['set_theme', 'fetch_nip', 'ask_questions'];

/** A nostr client stub; the bundles never query it at construction. */
const mockNostr = { query: async () => [] } as unknown as NPool;

const NOSTR_LOOKUP_NAMES = ['nak', 'search_nips'];

describe('createBaseToolBundle', () => {
  it('contains the always-on base tools in order', () => {
    const bundle = createBaseToolBundle({ applyCustomTheme: () => {} });
    expect(bundle.map((b) => b.name)).toEqual(BASE_NAMES);
    expect(bundle[0].tool.inputSchema).toBeDefined();
  });

  it('includes fetch_nip (official, merge-gated spec content)', () => {
    const bundle = createBaseToolBundle({ applyCustomTheme: () => {} });
    expect(bundle.map((b) => b.name)).toContain('fetch_nip');
  });

  it('does not include nak or search_nips in the always-on base bundle', () => {
    // Both put attacker-controlled Nostr event content into the model's
    // context, so both live behind the opt-in 'nostr-lookup' ability.
    const bundle = createBaseToolBundle({ applyCustomTheme: () => {} });
    const names = bundle.map((b) => b.name);
    expect(names).not.toContain('nak');
    expect(names).not.toContain('search_nips');
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
  it('contains nak and search_nips wired to the supplied relay pool', () => {
    const bundle = createNostrLookupToolBundle({ nostr: mockNostr });
    expect(bundle.map((b) => b.name)).toEqual(NOSTR_LOOKUP_NAMES);
    const nak = bundle.find((b) => b.name === 'nak')!;
    expect(nak.tool.inputSchema).toBeDefined();
    expect(nak.tool.description).toContain('nostr');
    const searchNips = bundle.find((b) => b.name === 'search_nips')!;
    expect(searchNips.tool.inputSchema).toBeDefined();
  });
});

describe('buildSessionToolBundle', () => {
  it('returns only the base bundle for a session with no abilities', () => {
    const base = createBaseToolBundle({ applyCustomTheme: () => {} });
    const result = buildSessionToolBundle({ base, abilities: [] });
    expect(result.map((b) => b.name)).toEqual(BASE_NAMES);
  });

  it('includes fetch_nip for any ability selection, but search_nips only for nostr-lookup', () => {
    const base = createBaseToolBundle({ applyCustomTheme: () => {} });
    const withoutAbility = buildSessionToolBundle({ base, abilities: [] });
    const withAbility = buildSessionToolBundle({ base, abilities: ['nostr-lookup'], nostr: mockNostr });

    expect(withoutAbility.map((b) => b.name)).toContain('fetch_nip');
    expect(withAbility.map((b) => b.name)).toContain('fetch_nip');
    expect(withoutAbility.map((b) => b.name)).not.toContain('search_nips');
    expect(withAbility.map((b) => b.name)).toContain('search_nips');
  });

  it('adds nak and search_nips only for a nostr-lookup session', () => {
    const base = createBaseToolBundle({ applyCustomTheme: () => {} });
    const result = buildSessionToolBundle({
      base,
      abilities: ['nostr-lookup'],
      nostr: mockNostr,
    });
    expect(result.map((b) => b.name)).toEqual([...BASE_NAMES, ...NOSTR_LOOKUP_NAMES]);
    // A session without the ability gets neither: the ability is opt-in.
    const plainResult = buildSessionToolBundle({ base, abilities: [] });
    expect(plainResult.map((b) => b.name)).not.toContain('nak');
    expect(plainResult.map((b) => b.name)).not.toContain('search_nips');
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
