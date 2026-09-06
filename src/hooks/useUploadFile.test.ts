import { afterEach, describe, expect, it, vi } from 'vitest';

import { mirrorToServers } from './useUploadFile';

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
