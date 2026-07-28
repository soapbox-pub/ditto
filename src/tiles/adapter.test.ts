import type { NostrEvent, UnsignedEvent } from 'nostr-tools';
import { generateSecretKey, getPublicKey, nip19 } from 'nostr-tools';
import type { NavigateTarget } from '@soapbox.pub/nostr-canvas';
import { describe, expect, it, vi } from 'vitest';
import { createCanvasAdapter } from './adapter';

const PUBKEY = 'a'.repeat(64);

// Valid NIP-19 identifiers derived from a deterministic key for testing.
const SECKEY_BYTES = generateSecretKey();
const DERIVED_PUBKEY = getPublicKey(SECKEY_BYTES);
const VALID_NSEC = nip19.nsecEncode(SECKEY_BYTES);
const VALID_NPUB = nip19.npubEncode(DERIVED_PUBKEY);
const VALID_NOTE = nip19.noteEncode('b'.repeat(64));

function makeAdapter(opts: { openPath?: (path: string) => void; notify?: (message: string, variant: string) => void } = {}) {
  return createCanvasAdapter({
    subscribe: () => () => {},
    openPath: opts.openPath ?? vi.fn(),
    notify: opts.notify,
  });
}

function event(): NostrEvent {
  return {
    id: 'b'.repeat(64),
    pubkey: PUBKEY,
    created_at: 1_700_000_000,
    kind: 1,
    tags: [],
    content: 'hello',
    sig: 'c'.repeat(128),
  };
}

describe('createCanvasAdapter', () => {
  it('delegates subscriptions to Ditto and preserves their cleanup', () => {
    const cleanup = vi.fn();
    const subscribe = vi.fn(() => cleanup);
    const adapter = createCanvasAdapter({ subscribe });
    const onEvent = vi.fn();

    const stop = adapter.subscribe({ kinds: [1] }, onEvent);

    expect(subscribe).toHaveBeenCalledWith({ kinds: [1] }, onEvent);
    stop();
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it('uses the active Ditto signer to publish authenticated events', async () => {
    const publishEvent = vi.fn<(draft: UnsignedEvent) => Promise<NostrEvent>>().mockResolvedValue(event());
    const adapter = createCanvasAdapter({
      subscribe: () => () => {},
      user: { pubkey: PUBKEY },
      publishEvent,
    });

    await expect(adapter.publishEvent?.({ kind: 1, created_at: 1, tags: [], content: 'from tile', pubkey: PUBKEY })).resolves.toEqual(event());
    expect(publishEvent).toHaveBeenCalledOnce();
  });

  it('delegates profile and NIP-44 operations only through Ditto services', async () => {
    const onProfile = vi.fn();
    const profileCleanup = vi.fn();
    const getProfile = vi.fn(() => profileCleanup);
    const nip44Encrypt = vi.fn().mockResolvedValue('ciphertext');
    const nip44Decrypt = vi.fn().mockResolvedValue('plaintext');
    const adapter = createCanvasAdapter({
      subscribe: () => () => {},
      getProfile,
      nip44Encrypt,
      nip44Decrypt,
    });

    expect(adapter.getProfile?.(PUBKEY, onProfile)).toBe(profileCleanup);
    await expect(adapter.nip44Encrypt?.(PUBKEY, 'plaintext')).resolves.toBe('ciphertext');
    await expect(adapter.nip44Decrypt?.(PUBKEY, 'ciphertext')).resolves.toBe('plaintext');
  });

  it('only exposes the active Ditto identity and contacts', async () => {
    const getPublicKey = vi.fn().mockResolvedValue(PUBKEY);
    const getContacts = vi.fn().mockResolvedValue(['b'.repeat(64)]);
    const adapter = createCanvasAdapter({ subscribe: () => () => {}, getPublicKey, getContacts });

    await expect(adapter.getPublicKey?.()).resolves.toBe(PUBKEY);
    await expect(adapter.getContacts?.()).resolves.toEqual(['b'.repeat(64)]);
  });

  it('proxies HTTPS requests without credentials or sensitive request headers', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('safe response', { status: 200, headers: { 'content-type': 'text/plain' } }));
    const adapter = createCanvasAdapter({
      subscribe: () => () => {},
      fetch,
      corsProxy: () => 'https://proxy.example/?url={href}',
    });

    await expect(adapter.fetch?.({
      url: 'https://weather.example/api',
      method: 'POST',
      headers: { Authorization: 'Bearer secret', Cookie: 'session=secret', 'X-Trace': 'ok' },
      body: 'request body',
    })).resolves.toMatchObject({ ok: true, status: 200, body: 'safe response' });

    expect(fetch).toHaveBeenCalledWith(
      'https://proxy.example/?url=https%3A%2F%2Fweather.example%2Fapi',
      expect.objectContaining({ credentials: 'omit', headers: { 'X-Trace': 'ok' }, mode: 'cors' }),
    );
    await expect(adapter.fetch?.({ url: 'http://insecure.example' })).resolves.toMatchObject({ ok: false });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('calls the host fetch with the browser global as its receiver', async () => {
    const fetch = vi.fn(function(this: typeof globalThis) {
      expect(this).toBe(globalThis);
      return Promise.resolve(new Response('safe response', { status: 200 }));
    });
    const adapter = createCanvasAdapter({
      subscribe: () => () => {},
      fetch,
      corsProxy: () => 'https://proxy.example/?url={href}',
    });

    await expect(adapter.fetch?.({ url: 'https://weather.example/api' })).resolves.toMatchObject({ ok: true });
  });

  it('routes tile notifications through Ditto and rejects identifier navigation', async () => {
    const notify = vi.fn();
    const openPath = vi.fn();
    const adapter = makeAdapter({ notify, openPath });

    adapter.notify?.('Weather updated', 'success');
    // identifier targets are out of scope — always not_implemented
    await expect(adapter.navigate?.({ identifier: 'alice@example.com:weather' })).resolves.toEqual({ ok: false, reason: 'not_implemented' });
    expect(notify).toHaveBeenCalledWith('Weather updated', 'success');
    expect(openPath).not.toHaveBeenCalled();
  });

  describe('navigate – url targets', () => {
    it('opens an https URL via the /i/ internal browser path', async () => {
      const openPath = vi.fn();
      const adapter = makeAdapter({ openPath });

      await expect(adapter.navigate?.({ url: 'https://en.wikipedia.org/wiki/Main_Page' })).resolves.toEqual({ ok: true });
      expect(openPath).toHaveBeenCalledWith('/i/https%3A%2F%2Fen.wikipedia.org%2Fwiki%2FMain_Page');
    });

    it('rejects http URLs', async () => {
      const openPath = vi.fn();
      const adapter = makeAdapter({ openPath });

      await expect(adapter.navigate?.({ url: 'http://insecure.example' })).resolves.toEqual({ ok: false, reason: 'rejected' });
      expect(openPath).not.toHaveBeenCalled();
    });

    it('rejects javascript URLs', async () => {
      const openPath = vi.fn();
      const adapter = makeAdapter({ openPath });

      await expect(adapter.navigate?.({ url: 'javascript:alert(1)' })).resolves.toEqual({ ok: false, reason: 'rejected' });
      expect(openPath).not.toHaveBeenCalled();
    });
  });

  describe('navigate – pointer targets', () => {
    it('opens an npub via the root path', async () => {
      const openPath = vi.fn();
      const adapter = makeAdapter({ openPath });

      await expect(adapter.navigate?.({ pointer: VALID_NPUB })).resolves.toEqual({ ok: true });
      expect(openPath).toHaveBeenCalledWith(`/${VALID_NPUB}`);
    });

    it('opens a note nevent via the root path', async () => {
      const openPath = vi.fn();
      const adapter = makeAdapter({ openPath });

      await expect(adapter.navigate?.({ pointer: VALID_NOTE })).resolves.toEqual({ ok: true });
      expect(openPath).toHaveBeenCalledWith(`/${VALID_NOTE}`);
    });

    it('rejects nsec pointers', async () => {
      const openPath = vi.fn();
      const adapter = makeAdapter({ openPath });

      await expect(adapter.navigate?.({ pointer: VALID_NSEC })).resolves.toEqual({ ok: false, reason: 'rejected' });
      expect(openPath).not.toHaveBeenCalled();
    });

    it('handles the `nostr` key (wasm/Lua field name)', async () => {
      const openPath = vi.fn();
      const adapter = makeAdapter({ openPath });

      // The wasm runtime forwards the Lua field name `nostr`; the TS type
      // uses `pointer`. Verify we handle both keys.
      const target = { nostr: VALID_NPUB } as unknown as NavigateTarget;
      await expect(adapter.navigate?.(target)).resolves.toEqual({ ok: true });
      expect(openPath).toHaveBeenCalledWith(`/${VALID_NPUB}`);
    });
  });

  describe('navigate – not implemented when no openPath', () => {
    it('leaves navigate unset when no openPath service is provided', () => {
      const adapter = createCanvasAdapter({ subscribe: () => () => {} });
      // The runtime falls back to not_implemented when navigate is absent.
      expect(adapter.navigate).toBeUndefined();
    });
  });

  it('routes image uploads through the host upload service', async () => {
    const uploadImage = vi.fn().mockResolvedValue('https://blossom.example/my-file.png');
    const adapter = createCanvasAdapter({ subscribe: () => () => {}, uploadImage });

    await expect(adapter.uploadImage?.()).resolves.toBe('https://blossom.example/my-file.png');
    expect(uploadImage).toHaveBeenCalledOnce();
  });
});
