import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setLuaLintEngine } from '@soapbox.pub/nostr-canvas/devkit';
import type { NPool } from '@nostrify/nostrify';
import type { ToolResult } from '@soapbox.pub/nostr-canvas/devkit';

import {
  createBaseToolBundle,
  createNostrLookupToolBundle,
  createTilesToolBundle,
  buildSessionToolBundle,
  type TileDraftStore,
} from './toolRegistry';

const BASE_NAMES = ['set_theme', 'search_nips', 'fetch_nip'];

/** A nostr client stub; the bundles never query it at construction. */
const mockNostr = { query: async () => [] } as unknown as NPool;

const NOSTR_LOOKUP_NAMES = ['nak'];

const TILES_NAMES = [
  'read_code',
  'write_code',
  'edit_code',
  'set_tile',
  'get_tile',
  'preview_tile',
  'ask_questions',
  'set_notes',
  'read_spec',
  'read_examples',
];

let projectCounter = 0;
function projectId(): string {
  projectCounter += 1;
  return `proj-${projectCounter}`;
}

/** In-memory draft store so each test gets an isolated one. */
function makeStore(): TileDraftStore {
  const code = new Map<string, string>();
  const notes = new Map<string, string>();
  return {
    getCode: (id) => code.get(id) ?? '',
    setCode: (id, c) => {
      code.set(id, c);
    },
    getNotes: (id) => notes.get(id) ?? '',
    setNotes: (id, n) => {
      notes.set(id, n);
    },
    seedCode: (id, seed) => {
      if (seed && !code.has(id)) code.set(id, seed);
    },
  };
}

function bundleByName(bundle: ReturnType<typeof createTilesToolBundle>) {
  return new Map(bundle.map((b) => [b.name, b.tool]));
}

/** The tiles tools under test all return content results (ask_questions is the only pending-input one, untested here). */
function contentOf(result: ToolResult): string {
  if (!('content' in result)) throw new Error('expected a content result');
  return result.content;
}

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

describe('createTilesToolBundle', () => {
  beforeEach(() => {
    // Devkit's write/edit tools lint through fengari, which needs eval at
    // module-load time. Swap in a no-op engine so tests never touch it.
    setLuaLintEngine({ check: async () => [] });
  });

  afterEach(() => {
    setLuaLintEngine(null);
  });

  it('contains the 10 devkit tools in order', () => {
    const bundle = createTilesToolBundle({ projectId: projectId() });
    expect(bundle.map((b) => b.name)).toEqual(TILES_NAMES);
  });

  it('round-trips draft code through write_code and read_code', async () => {
    const store = makeStore();
    const pid = projectId();
    const tools = bundleByName(createTilesToolBundle({ projectId: pid, store }));

    const write = await tools.get('write_code')!.execute({ code: 'print("hello")' });
    expect(contentOf(write)).toContain('File written');

    const read = await tools.get('read_code')!.execute({});
    expect(contentOf(read)).toContain('print("hello")');
    expect(store.getCode(pid)).toBe('print("hello")');
  });

  it('seeds the draft with seedCode on first access', () => {
    const store = makeStore();
    const pid = projectId();
    createTilesToolBundle({ projectId: pid, seedCode: '-- seeded', store });
    expect(store.getCode(pid)).toBe('-- seeded');
  });

  it('does not overwrite an existing draft when reseeding', () => {
    const store = makeStore();
    const pid = projectId();
    store.setCode(pid, 'existing');
    createTilesToolBundle({ projectId: pid, seedCode: '-- seeded', store });
    expect(store.getCode(pid)).toBe('existing');
  });

  it('edit_code applies hashline operations to the current draft', async () => {
    const store = makeStore();
    const pid = projectId();
    store.setCode(pid, 'line one\nline two');
    const tools = bundleByName(createTilesToolBundle({ projectId: pid, store }));

    const read = await tools.get('read_code')!.execute({});
    const firstTag = contentOf(read).split('\n')[1].split('|')[0].trim();

    const edit = await tools.get('edit_code')!.execute({
      operations: [{ op: 'replace_line', hash: firstTag, content: 'new first' }],
    });
    expect(contentOf(edit)).toContain('Applied 1 operation');
    expect(store.getCode(pid)).toBe('new first\nline two');
  });

  it('set_tile and get_tile round-trip the declared tile state', async () => {
    const store = makeStore();
    const pid = projectId();
    store.setCode(pid, '-- tile code');
    const tools = bundleByName(createTilesToolBundle({ projectId: pid, store }));

    await tools.get('set_tile')!.execute({
      name: 'My Tile',
      summary: 'Does things',
      settings: [{ key: 'relay', value: 'wss://example.com', label: 'Relay' }],
    });

    const got = await tools.get('get_tile')!.execute({});
    const parsed = JSON.parse(contentOf(got)) as { name: string };
    expect(parsed.name).toBe('My Tile');
  });

  it('preview_tile says live preview is not available yet once state is set', async () => {
    const store = makeStore();
    const pid = projectId();
    store.setCode(pid, '-- tile code');
    const tools = bundleByName(createTilesToolBundle({ projectId: pid, store }));

    await tools.get('set_tile')!.execute({
      name: 'My Tile',
      summary: 'Does things',
      settings: [],
    });

    const preview = await tools.get('preview_tile')!.execute({});
    expect(contentOf(preview)).toMatch(/not available/i);
  });

  it('preview_tile before set_tile tells the model to register state first', async () => {
    const tools = bundleByName(createTilesToolBundle({ projectId: projectId(), store: makeStore() }));
    const preview = await tools.get('preview_tile')!.execute({});
    expect(contentOf(preview)).toContain('set_tile first');
  });

  it('set_notes stores working notes in the draft store', async () => {
    const store = makeStore();
    const pid = projectId();
    const tools = bundleByName(createTilesToolBundle({ projectId: pid, store }));

    await tools.get('set_notes')!.execute({ notes: 'remember this' });
    expect(store.getNotes(pid)).toBe('remember this');
  });
});

describe('buildSessionToolBundle', () => {
  it('returns only the base bundle for a session with no abilities', () => {
    const base = createBaseToolBundle({ applyCustomTheme: () => {} });
    const result = buildSessionToolBundle({ base, abilities: [], projectId: projectId() });
    expect(result.map((b) => b.name)).toEqual(BASE_NAMES);
  });

  it('includes the NIP lookup tools for any ability selection', () => {
    const base = createBaseToolBundle({ applyCustomTheme: () => {} });
    const results = [
      buildSessionToolBundle({ base, abilities: [], projectId: projectId() }),
      buildSessionToolBundle({ base, abilities: ['tiles'], projectId: projectId() }),
      buildSessionToolBundle({ base, abilities: ['nostr-lookup'], projectId: projectId(), nostr: mockNostr }),
    ];
    for (const result of results) {
      const names = result.map((b) => b.name);
      expect(names).toContain('search_nips');
      expect(names).toContain('fetch_nip');
    }
  });

  it('concatenates the base bundle with the tiles ability bundle', () => {
    const base = createBaseToolBundle({ applyCustomTheme: () => {} });
    const result = buildSessionToolBundle({ base, abilities: ['tiles'], projectId: projectId() });
    expect(result.map((b) => b.name)).toEqual([...BASE_NAMES, ...TILES_NAMES]);
  });

  it('adds the nak tool only for a nostr-lookup session', () => {
    const base = createBaseToolBundle({ applyCustomTheme: () => {} });
    const result = buildSessionToolBundle({
      base,
      abilities: ['nostr-lookup'],
      projectId: projectId(),
      nostr: mockNostr,
    });
    expect(result.map((b) => b.name)).toEqual([...BASE_NAMES, ...NOSTR_LOOKUP_NAMES]);
    // A tiles-only session gets no nak: the ability is opt-in.
    const tilesResult = buildSessionToolBundle({ base, abilities: ['tiles'], projectId: projectId() });
    expect(tilesResult.map((b) => b.name)).not.toContain('nak');
  });

  it('throws when a nostr-lookup session is built without a relay pool', () => {
    const base = createBaseToolBundle({ applyCustomTheme: () => {} });
    expect(() =>
      buildSessionToolBundle({ base, abilities: ['nostr-lookup'], projectId: projectId() }),
    ).toThrow(/requires a nostr relay pool/);
  });

  it('does not mutate the base array when concatenating', () => {
    const base = createBaseToolBundle({ applyCustomTheme: () => {} });
    buildSessionToolBundle({ base, abilities: ['tiles'], projectId: projectId() });
    expect(base.map((b) => b.name)).toEqual(BASE_NAMES);
  });
});
