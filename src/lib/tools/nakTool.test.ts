import { describe, it, expect, vi } from 'vitest';
import { nip19 } from 'nostr-tools';
import type { NPool, NostrEvent, NostrFilter } from '@nostrify/nostrify';
import type { ToolResult } from '@soapbox.pub/nostr-canvas/devkit';

import { createNakTool } from './nakTool';

// Test fixtures: valid 64-char hex identifiers plus their NIP-19 encodings.
const PUBKEY = 'aa'.repeat(32);
const OTHER_PUBKEY = 'bb'.repeat(32);
const EVENT_ID = 'cc'.repeat(32);
const NPUB = nip19.npubEncode(PUBKEY);
const NOTE1 = nip19.noteEncode(EVENT_ID);
const NEVENT1 = nip19.neventEncode({ id: EVENT_ID });

function makeEvent(overrides: Partial<NostrEvent> = {}): NostrEvent {
  return {
    id: EVENT_ID,
    pubkey: PUBKEY,
    kind: 1,
    created_at: 1_700_000_000,
    content: 'hello nostr',
    tags: [],
    sig: 'dd'.repeat(32),
    ...overrides,
  };
}

function contentOf(result: ToolResult): string {
  if (!('content' in result)) throw new Error('expected a content result');
  return result.content;
}

/**
 * A nostr client stub recording query calls. `events` may be a fixed array
 * or a function of the first filter, so tests can vary per-query results.
 */
function mockNostr(events: NostrEvent[] | ((filter: NostrFilter) => NostrEvent[])) {
  const query = vi.fn(async (filters: NostrFilter[]): Promise<NostrEvent[]> => {
    return typeof events === 'function' ? events(filters[0]) : events;
  });
  const nostr = { query } as unknown as NPool;
  return { nostr, query };
}

describe('createNakTool req action', () => {
  it('queries the app relay pool with kinds and the default limit', async () => {
    const { nostr, query } = mockNostr([makeEvent()]);
    const result = await createNakTool(nostr).execute({ action: 'req', kinds: [1] });

    expect(query.mock.calls[0][0]).toEqual([{ kinds: [1], limit: 20 }]);
    expect(contentOf(result)).toContain('Found 1 event');
    expect(contentOf(result)).toContain(EVENT_ID);
    expect(contentOf(result)).toContain('hello nostr');
  });

  it('maps tag letters to #<letter> filter keys', async () => {
    const { nostr, query } = mockNostr([makeEvent()]);
    await createNakTool(nostr).execute({
      action: 'req',
      kinds: [1],
      tags: { t: ['nostr'], e: [EVENT_ID] },
    });

    const filters = query.mock.calls[0][0] as NostrFilter[];
    expect(filters).toEqual([{ kinds: [1], limit: 20, '#t': ['nostr'], '#e': [EVENT_ID] }]);
  });

  it('passes authors, since, and until through to the filter', async () => {
    const { nostr, query } = mockNostr([makeEvent()]);
    await createNakTool(nostr).execute({
      action: 'req',
      kinds: [0],
      authors: [PUBKEY],
      since: 1_000,
      until: 2_000,
    });

    expect(query.mock.calls[0][0]).toEqual([
      { kinds: [0], authors: [PUBKEY], since: 1_000, until: 2_000, limit: 20 },
    ]);
  });

  it('caps an oversized limit at 50', async () => {
    const { nostr, query } = mockNostr([makeEvent()]);
    await createNakTool(nostr).execute({ action: 'req', kinds: [1], limit: 500 });

    expect(query.mock.calls[0][0]).toEqual([{ kinds: [1], limit: 50 }]);
  });

  it('rejects non-hex author pubkeys with a clear error', async () => {
    const { nostr, query } = mockNostr([makeEvent()]);
    const result = await createNakTool(nostr).execute({
      action: 'req',
      kinds: [1],
      authors: ['npub1nothex'],
    });

    const parsed = JSON.parse(contentOf(result)) as { error: string };
    expect(parsed.error).toContain('hex');
    expect(query).not.toHaveBeenCalled();
  });

  it('truncates long event content in the summary', async () => {
    const { nostr } = mockNostr([makeEvent({ content: 'x'.repeat(500) })]);
    const result = await createNakTool(nostr).execute({ action: 'req', kinds: [1] });

    expect(contentOf(result)).not.toContain('x'.repeat(300));
  });

  it('caps total output size and notes omitted events', async () => {
    const events = Array.from({ length: 100 }, (_, i) => makeEvent({ content: `note ${i}` }));
    const { nostr } = mockNostr(events);
    const result = await createNakTool(nostr).execute({ action: 'req', kinds: [1] });

    expect(contentOf(result)).toContain('Found 100 event');
    expect(contentOf(result)).toMatch(/more not shown/);
  });
});

describe('createNakTool fetch action', () => {
  it('queries a single event by hex id', async () => {
    const { nostr, query } = mockNostr([makeEvent()]);
    const result = await createNakTool(nostr).execute({ action: 'fetch', id: EVENT_ID });

    expect(query.mock.calls[0][0]).toEqual([{ ids: [EVENT_ID], limit: 1 }]);
    expect(contentOf(result)).toContain(EVENT_ID);
  });

  it('decodes a note1 identifier before querying', async () => {
    const { nostr, query } = mockNostr([makeEvent()]);
    await createNakTool(nostr).execute({ action: 'fetch', id: NOTE1 });

    expect(query.mock.calls[0][0]).toEqual([{ ids: [EVENT_ID], limit: 1 }]);
  });

  it('decodes a nevent1 identifier before querying', async () => {
    const { nostr, query } = mockNostr([makeEvent()]);
    await createNakTool(nostr).execute({ action: 'fetch', id: NEVENT1 });

    expect(query.mock.calls[0][0]).toEqual([{ ids: [EVENT_ID], limit: 1 }]);
  });

  it('reports when the event is not found', async () => {
    const { nostr } = mockNostr([]);
    const result = await createNakTool(nostr).execute({ action: 'fetch', id: EVENT_ID });

    expect(contentOf(result)).toMatch(/not found/i);
  });

  it('rejects an unparseable id', async () => {
    const { nostr, query } = mockNostr([makeEvent()]);
    const result = await createNakTool(nostr).execute({ action: 'fetch', id: 'not-an-id' });

    expect(JSON.parse(contentOf(result))).toHaveProperty('error');
    expect(query).not.toHaveBeenCalled();
  });
});

describe('createNakTool profile action', () => {
  it('queries kind 0 metadata and returns the parsed JSON content', async () => {
    const profile = { name: 'Alice', picture: 'https://example.com/a.png', about: 'hello' };
    const { nostr, query } = mockNostr([makeEvent({ kind: 0, content: JSON.stringify(profile) })]);
    const result = await createNakTool(nostr).execute({ action: 'profile', pubkey: PUBKEY });

    expect(query.mock.calls[0][0]).toEqual([{ kinds: [0], authors: [PUBKEY], limit: 1 }]);
    const parsed = JSON.parse(contentOf(result)) as { name: string; pubkey: string };
    expect(parsed.name).toBe('Alice');
    expect(parsed.pubkey).toBe(PUBKEY);
  });

  it('decodes an npub1 pubkey before querying', async () => {
    const { nostr, query } = mockNostr([makeEvent({ kind: 0, content: '{}' })]);
    await createNakTool(nostr).execute({ action: 'profile', pubkey: NPUB });

    expect(query.mock.calls[0][0]).toEqual([{ kinds: [0], authors: [PUBKEY], limit: 1 }]);
  });

  it('reports when no profile exists', async () => {
    const { nostr } = mockNostr([]);
    const result = await createNakTool(nostr).execute({ action: 'profile', pubkey: PUBKEY });

    expect(contentOf(result)).toMatch(/no profile/i);
  });

  it('survives non-JSON kind-0 content', async () => {
    const { nostr } = mockNostr([makeEvent({ kind: 0, content: 'not json' })]);
    const result = await createNakTool(nostr).execute({ action: 'profile', pubkey: PUBKEY });

    expect(contentOf(result)).toContain('not json');
  });
});

describe('createNakTool decode action', () => {
  it('decodes an npub into its type and hex data', async () => {
    const { nostr } = mockNostr([]);
    const result = await createNakTool(nostr).execute({ action: 'decode', identifier: NPUB });

    const parsed = JSON.parse(contentOf(result)) as { type: string; data: string };
    expect(parsed.type).toBe('npub');
    expect(parsed.data).toBe(PUBKEY);
  });

  it('decodes an naddr with its pointer fields', async () => {
    const naddr = nip19.naddrEncode({ identifier: 'my-post', pubkey: PUBKEY, kind: 30023 });
    const { nostr } = mockNostr([]);
    const result = await createNakTool(nostr).execute({ action: 'decode', identifier: naddr });

    const parsed = JSON.parse(contentOf(result)) as {
      type: string;
      data: { identifier: string; pubkey: string; kind: number };
    };
    expect(parsed.type).toBe('naddr');
    expect(parsed.data).toEqual(expect.objectContaining({ identifier: 'my-post', pubkey: PUBKEY, kind: 30023 }));
  });

  it('redacts nsec secret key bytes', async () => {
    const nsec = nip19.nsecEncode(new Uint8Array(32).fill(7));
    const { nostr } = mockNostr([]);
    const result = await createNakTool(nostr).execute({ action: 'decode', identifier: nsec });

    const parsed = JSON.parse(contentOf(result)) as { type: string; data: unknown; note?: string };
    expect(parsed.type).toBe('nsec');
    expect(parsed.data).toBeNull();
    expect(parsed.note).toMatch(/redact/i);
  });

  it('rejects an invalid identifier', async () => {
    const { nostr } = mockNostr([]);
    const result = await createNakTool(nostr).execute({ action: 'decode', identifier: 'not-bech32' });

    expect(JSON.parse(contentOf(result))).toHaveProperty('error');
  });
});

describe('createNakTool encode action', () => {
  it('encodes an npub from a hex pubkey', async () => {
    const { nostr } = mockNostr([]);
    const result = await createNakTool(nostr).execute({ action: 'encode', type: 'npub', pubkey: PUBKEY });

    expect(contentOf(result)).toBe(NPUB);
  });

  it('encodes a note from a hex event id', async () => {
    const { nostr } = mockNostr([]);
    const result = await createNakTool(nostr).execute({ action: 'encode', type: 'note', id: EVENT_ID });

    expect(contentOf(result)).toBe(NOTE1);
  });

  it('encodes an naddr from its pointer fields', async () => {
    const { nostr } = mockNostr([]);
    const result = await createNakTool(nostr).execute({
      action: 'encode',
      type: 'naddr',
      identifier: 'my-post',
      pubkey: PUBKEY,
      kind: 30023,
    });

    expect(contentOf(result)).toBe(
      nip19.naddrEncode({ identifier: 'my-post', pubkey: PUBKEY, kind: 30023 }),
    );
  });

  it('encodes a nevent with an optional author and kind', async () => {
    const { nostr } = mockNostr([]);
    const result = await createNakTool(nostr).execute({
      action: 'encode',
      type: 'nevent',
      id: EVENT_ID,
      author: OTHER_PUBKEY,
      kind: 1,
    });

    expect(contentOf(result)).toBe(
      nip19.neventEncode({ id: EVENT_ID, author: OTHER_PUBKEY, kind: 1 }),
    );
  });

  it('errors on a non-hex pubkey', async () => {
    const { nostr } = mockNostr([]);
    const result = await createNakTool(nostr).execute({ action: 'encode', type: 'npub', pubkey: 'zz' });

    expect(contentOf(result)).toContain('hex');
  });

  it('errors when required fields are missing', async () => {
    const { nostr } = mockNostr([]);
    const result = await createNakTool(nostr).execute({
      action: 'encode',
      type: 'naddr',
      pubkey: PUBKEY,
      identifier: 'my-post',
    });

    expect(contentOf(result)).toContain('kind');
  });
});

describe('createNakTool shape', () => {
  it('exposes a discriminated union schema with an action field', () => {
    const { nostr } = mockNostr([]);
    const tool = createNakTool(nostr);

    expect(tool.description).toContain('nostr');
    expect(tool.inputSchema).toBeDefined();

    const schema = tool.inputSchema!;
    const req = schema.parse({ action: 'req', kinds: [1] });
    const fetch = schema.parse({ action: 'fetch', id: EVENT_ID });
    const profile = schema.parse({ action: 'profile', pubkey: NPUB });
    const decode = schema.parse({ action: 'decode', identifier: NPUB });
    const encode = schema.parse({ action: 'encode', type: 'note', id: EVENT_ID });

    expect(req).toMatchObject({ action: 'req' });
    expect(fetch).toMatchObject({ action: 'fetch' });
    expect(profile).toMatchObject({ action: 'profile' });
    expect(decode).toMatchObject({ action: 'decode' });
    expect(encode).toMatchObject({ action: 'encode' });
  });
});
