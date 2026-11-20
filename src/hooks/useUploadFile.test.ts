import { afterEach, describe, expect, it, vi } from 'vitest';

import { mirrorToServers, writeToFirstServer } from './useUploadFile';

import type { NostrEvent, NostrSigner } from '@nostrify/nostrify';

/**
 * BUD-04 mirroring, checked against what a conforming server actually
 * validates (BUD-11): a `PUT /mirror` per target server carrying `{url}`, with
 * a kind-24242 token whose verb is `upload` (there is no `mirror` verb), whose
 * `x` tag names the blob, encoded as base64url. The previous hand-built token
 * (`t=mirror`, no `x`, standard base64) was refused by live servers, so no
 * upload was ever mirrored and every blob lived on exactly one server.
 */
describe('mirrorToServers', () => {
  const HASH = 'c'.repeat(64);
  const SOURCE = `https://blossom.dreamith.to/${HASH}.png`;
  const PUBKEY = 'e'.repeat(64);

  const signer: NostrSigner = {
    getPublicKey: async () => PUBKEY,
    signEvent: async (t) => ({ ...t, pubkey: PUBKEY, id: 'f'.repeat(64), sig: '0'.repeat(128) }) as NostrEvent,
  };

  /** The event out of a `Nostr <base64url>` header. */
  function tokenOf(headers: HeadersInit | undefined): NostrEvent {
    const auth = new Headers(headers).get('authorization') ?? '';
    expect(auth.startsWith('Nostr ')).toBe(true);
    const b64 = auth.slice(6);
    // Base64url, unpadded, as BUD-11 requires.
    expect(b64).not.toMatch(/[+/=]/);
    return JSON.parse(atob(b64.replace(/-/g, '+').replace(/_/g, '/')));
  }

  afterEach(() => vi.unstubAllGlobals());

  it('sends one PUT /mirror per server with a BUD-11 upload token naming the blob', async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input) =>
      new Response(JSON.stringify({ url: `${new URL(String(input)).origin}/${HASH}.png`, sha256: HASH, size: 3 })),
    );
    vi.stubGlobal('fetch', fetchMock);

    await mirrorToServers(SOURCE, ['https://a.example/', 'https://b.example/'], signer);

    const calls = fetchMock.mock.calls.map(([input, init]) => ({
      url: String(input),
      method: init?.method,
      body: JSON.parse(String(init?.body)),
      token: tokenOf(init?.headers),
    }));
    expect(calls.map((c) => c.url)).toEqual(['https://a.example/mirror', 'https://b.example/mirror']);
    for (const c of calls) {
      expect(c.method).toBe('PUT');
      expect(c.body).toEqual({ url: SOURCE });
      expect(c.token.kind).toBe(24242);
      expect(c.token.tags).toContainEqual(['t', 'upload']);
      expect(c.token.tags).toContainEqual(['x', HASH]);
      expect(c.token.tags.some(([name]) => name === 'expiration')).toBe(true);
    }
  });

  it('keeps going when one server rejects, and never throws', async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input) =>
      String(input).startsWith('https://a.example')
        ? new Response(null, { status: 502 })
        : new Response(JSON.stringify({ url: `https://b.example/${HASH}.png`, sha256: HASH, size: 3 })),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(mirrorToServers(SOURCE, ['https://a.example/', 'https://b.example/'], signer)).resolves.toBeUndefined();
    expect(fetchMock.mock.calls.map(([input]) => String(input))).toEqual([
      'https://a.example/mirror',
      'https://b.example/mirror',
    ]);
  });
});

/**
 * Servers are written one at a time, so no server ever has a direct upload
 * and a mirror of the same blob in flight together (#337): racing every
 * server and mirroring to the losers made servers store the blob twice.
 */
describe('writeToFirstServer', () => {
  const HASH = 'c'.repeat(64);
  const PUBKEY = 'e'.repeat(64);
  // jsdom's File has no arrayBuffer(), which the uploader hashes with.
  const FILE = Object.assign(new File(['abc'], 'a.png', { type: 'image/png' }), {
    arrayBuffer: async () => new TextEncoder().encode('abc').buffer,
  });

  const signer: NostrSigner = {
    getPublicKey: async () => PUBKEY,
    signEvent: async (t) => ({ ...t, pubkey: PUBKEY, id: 'f'.repeat(64), sig: '0'.repeat(128) }) as NostrEvent,
  };

  const ok = (input: RequestInfo | URL) =>
    new Response(JSON.stringify({ url: `${new URL(String(input)).origin}/${HASH}.png`, sha256: HASH, size: 3 }));

  const upload = (servers: string[]) =>
    writeToFirstServer(servers, signer, (uploader) => uploader.upload(FILE));

  afterEach(() => vi.unstubAllGlobals());

  it('writes only to the primary when it succeeds, leaving the rest to mirror', async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input) => ok(input));
    vi.stubGlobal('fetch', fetchMock);

    const placement = await upload(['https://a.example/', 'https://b.example/', 'https://c.example/']);

    expect(fetchMock.mock.calls.map(([input]) => String(input))).toEqual(['https://a.example/upload']);
    expect(placement.tags?.[0]).toEqual(['url', `https://a.example/${HASH}.png`]);
    expect(placement.untried).toEqual(['https://b.example/', 'https://c.example/']);
  });

  it('sends nothing to the next server while the primary is still working', async () => {
    let finish!: () => void;
    const fetchMock = vi.fn<typeof fetch>((input) =>
      new Promise<Response>((resolve) => { finish = () => resolve(ok(input)); }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const pending = upload(['https://a.example/', 'https://b.example/']);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 50));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    finish();
    const placement = await pending;
    expect(fetchMock.mock.calls.map(([input]) => String(input))).toEqual(['https://a.example/upload']);
    expect(placement.untried).toEqual(['https://b.example/']);
  });

  it('falls back on a refusal, and never mirrors to a server it already tried', async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input) =>
      String(input).startsWith('https://a.example') ? new Response(null, { status: 502 }) : ok(input),
    );
    vi.stubGlobal('fetch', fetchMock);

    const placement = await upload(['https://a.example/', 'https://b.example/', 'https://c.example/']);

    expect(fetchMock.mock.calls.map(([input]) => String(input))).toEqual([
      'https://a.example/upload',
      'https://b.example/upload',
    ]);
    expect(placement.tags?.[0]).toEqual(['url', `https://b.example/${HASH}.png`]);
    expect(placement.untried).toEqual(['https://c.example/']);
    expect(placement.refused).toEqual(['https://a.example/']);
  });

  it('treats a timed-out server as possibly still writing, not as refused', async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      if (String(input).startsWith('https://a.example')) throw new DOMException('timed out', 'TimeoutError');
      return ok(input);
    });
    vi.stubGlobal('fetch', fetchMock);

    const placement = await upload(['https://a.example/', 'https://b.example/']);

    expect(placement.tags?.[0]).toEqual(['url', `https://b.example/${HASH}.png`]);
    expect(placement.refused).toEqual([]);
    expect(placement.untried).toEqual([]);
  });

  it('reports the last error when every server fails', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => new Response(null, { status: 500 })));

    const placement = await upload(['https://a.example/', 'https://b.example/']);

    expect(placement.tags).toBeUndefined();
    expect(placement.error).toBeInstanceOf(Error);
    expect(placement.refused).toEqual(['https://a.example/', 'https://b.example/']);
  });

  it('does not mirror back to a duplicate entry for the server that took the blob', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (input) => ok(input)));

    const placement = await upload(['https://a.example/', 'https://a.example', 'https://b.example/']);

    expect(placement.untried).toEqual(['https://b.example/']);
  });
});
