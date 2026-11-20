import { describe, expect, it, vi } from 'vitest';

import { NSecSigner } from '@nostrify/nostrify';
import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';
import { finalizeEvent, generateSecretKey, getPublicKey } from 'nostr-tools';

import { Nip46Signer } from '@/lib/nip46Signer';
import type { Nip46Transport } from '@/lib/nip46Transport';

type RelayMsg = ['EVENT', string, NostrEvent];

/**
 * In-memory stand-in for Nip46Transport: same req/event surface, no sockets.
 * `emit` delivers an inbound event to every live subscription (like a relay
 * would); `published` records every outbound request event.
 */
function makeFakeTransport() {
  const published: NostrEvent[] = [];
  /** The relay each publish was limited to, if any (parallel to `published`). */
  const publishedTo: (string | undefined)[] = [];
  const listeners = new Set<(event: NostrEvent) => void>();
  const reopenListeners = new Set<(url: string) => void>();
  const resumeListeners = new Set<() => void>();
  let onPublish: ((event: NostrEvent) => void) | undefined;

  const transport = {
    published,
    publishedTo,
    onReopen(fn: (url: string) => void) {
      reopenListeners.add(fn);
      return () => {
        reopenListeners.delete(fn);
      };
    },
    reopen(url: string) {
      for (const fn of reopenListeners) fn(url);
    },
    onResume(fn: () => void) {
      resumeListeners.add(fn);
      return () => {
        resumeListeners.delete(fn);
      };
    },
    resume() {
      for (const fn of resumeListeners) fn();
    },
    emit(event: NostrEvent) {
      for (const l of [...listeners]) l(event);
    },
    setOnPublish(fn: (event: NostrEvent) => void) {
      onPublish = fn;
    },
    req(_filters: NostrFilter[], opts?: { signal?: AbortSignal }) {
      const queue: RelayMsg[] = [];
      let wake: (() => void) | undefined;
      let ended = false;
      const listener = (event: NostrEvent) => {
        queue.push(['EVENT', 'sub', event]);
        wake?.();
      };
      listeners.add(listener);
      const end = () => {
        if (ended) return;
        ended = true;
        listeners.delete(listener);
        wake?.();
      };
      opts?.signal?.addEventListener('abort', end, { once: true });
      return {
        async *[Symbol.asyncIterator](): AsyncGenerator<RelayMsg> {
          try {
            for (;;) {
              while (queue.length > 0) yield queue.shift()!;
              if (ended) return;
              await new Promise<void>((r) => {
                wake = r;
              });
              wake = undefined;
            }
          } finally {
            end();
          }
        },
      };
    },
    async event(event: NostrEvent, opts?: { signal?: AbortSignal; relay?: string }) {
      published.push(event);
      publishedTo.push(opts?.relay);
      onPublish?.(event);
    },
  };
  return transport;
}

type FakeTransport = ReturnType<typeof makeFakeTransport>;

interface BunkerRequest {
  id: string;
  method: string;
  params: string[];
}

/**
 * Wire a virtual remote signer to the fake transport. `handler` receives
 * each decrypted request and returns the response payload (`{ result }` or
 * `{ error }`), or `null` to stay silent (simulating a lost request).
 * Responses are NIP-44 encrypted unless `legacyNip04` is set.
 */
function attachBunker(
  transport: FakeTransport,
  handler: (req: BunkerRequest, event: NostrEvent) => Promise<{ result?: string; error?: string } | null>,
  opts?: { legacyNip04?: boolean },
) {
  const bunkerSigner = new NSecSigner(bunkerSk);
  const clientPubkey = getPublicKey(clientSk);

  transport.setOnPublish((event) => {
    void (async () => {
      const req = JSON.parse(await bunkerSigner.nip44.decrypt(clientPubkey, event.content)) as BunkerRequest;
      const out = await handler(req, event);
      if (!out) return;
      const payload = JSON.stringify({ id: req.id, ...out });
      const content = opts?.legacyNip04
        ? await bunkerSigner.nip04.encrypt(clientPubkey, payload)
        : await bunkerSigner.nip44.encrypt(clientPubkey, payload);
      const responseEvent = await bunkerSigner.signEvent({
        kind: 24133,
        content,
        created_at: Math.floor(Date.now() / 1000),
        tags: [['p', clientPubkey]],
      });
      transport.emit(responseEvent);
    })();
  });

  return bunkerSigner;
}

const clientSk = generateSecretKey();
const bunkerSk = generateSecretKey();
const bunkerPubkey = getPublicKey(bunkerSk);

function makeSigner(
  transport: FakeTransport,
  opts?: { attemptTimeoutMs?: number; attempts?: number; signTimeoutMs?: number; maxInFlight?: number },
) {
  return new Nip46Signer({
    transport: transport as unknown as Nip46Transport,
    bunkerPubkey,
    clientSigner: new NSecSigner(clientSk),
    attemptTimeoutMs: opts?.attemptTimeoutMs ?? 200,
    attempts: opts?.attempts ?? 2,
    signTimeoutMs: opts?.signTimeoutMs,
    maxInFlight: opts?.maxInFlight,
  });
}

/** The request ids carried by everything the client published. */
async function publishedRequestIds(transport: FakeTransport): Promise<string[]> {
  const bunker = new NSecSigner(bunkerSk);
  const clientPubkey = getPublicKey(clientSk);
  return Promise.all(
    transport.published.map(async (e) => (JSON.parse(await bunker.nip44.decrypt(clientPubkey, e.content)) as BunkerRequest).id),
  );
}

const pendingSize = (s: Nip46Signer) =>
  (s as unknown as { pending: Map<string, unknown> }).pending.size;

describe("Nip46Signer", () => {
  it("refuses a signed event that is not the one requested", async () => {
    const transport = makeFakeTransport();
    attachBunker(transport, async (req) => {
      const tpl = JSON.parse(req.params[0]);
      return { result: JSON.stringify(finalizeEvent({ ...tpl, content: 'something else' }, bunkerSk)) };
    });
    const signer = makeSigner(transport);
    await expect(signer.signEvent({ kind: 1, content: 'hi', tags: [], created_at: 1 })).rejects.toThrow(/not the one requested/);
  });

  it("round-trips sign_event through the bunker", async () => {
    const transport = makeFakeTransport();
    attachBunker(transport, async (req) => {
      expect(req.method).toBe('sign_event');
      const signed = await new NSecSigner(bunkerSk).signEvent(
        JSON.parse(req.params[0]) as Omit<NostrEvent, 'id' | 'pubkey' | 'sig'>,
      );
      return { result: JSON.stringify(signed) };
    });
    const signer = makeSigner(transport);

    const event = await signer.signEvent({
      kind: 1,
      content: 'hello',
      tags: [],
      created_at: 1_700_000_000,
    });

    expect(event.pubkey).toBe(getPublicKey(bunkerSk));
    expect(event.content).toBe('hello');
    expect(typeof event.sig).toBe('string');
    expect(transport.published).toHaveLength(1);
    expect(pendingSize(signer)).toBe(0);
  });

  it("matches concurrent responses to their requests by id", async () => {
    const transport = makeFakeTransport();
    attachBunker(transport, async (req) => {
      // Answer the SECOND request first: hold the slow one back.
      if (req.params[1] === 'slow') await new Promise((r) => setTimeout(r, 50));
      return { result: `decrypted:${req.params[1]}` };
    });
    // An attempt timeout the 50ms hold cannot trip. At the 200ms default, a
    // loaded box pushed the slow leg past the deadline, the signer republished
    // it, and the published count below saw 3 — a retry this test never meant
    // to exercise (that path has its own tests). Only the id-matching matters
    // here, so take the retry out of the picture rather than race it.
    const signer = makeSigner(transport, { attemptTimeoutMs: 30_000 });

    const [slow, fast] = await Promise.all([
      signer.nip44.decrypt('aa'.repeat(32), 'slow'),
      signer.nip44.decrypt('aa'.repeat(32), 'fast'),
    ]);

    expect(slow).toBe('decrypted:slow');
    expect(fast).toBe('decrypted:fast');
    expect(transport.published).toHaveLength(2);
    expect(pendingSize(signer)).toBe(0);
  });

  it("decrypts legacy NIP-04 responses", async () => {
    const transport = makeFakeTransport();
    attachBunker(transport, async () => ({ result: 'pong' }), { legacyNip04: true });
    const signer = makeSigner(transport);

    await expect(signer.ping()).resolves.toBe('pong');
  });

  it("waits for a signature the user approves late, re-publishing ONE request id meanwhile", async () => {
    const transport = makeFakeTransport();
    let seen = 0;
    attachBunker(transport, async (req) => {
      seen++;
      if (seen < 4) return null; // queued in the signer app, awaiting the user
      const tpl = JSON.parse(req.params[0]);
      return { result: JSON.stringify(finalizeEvent(tpl, bunkerSk)) };
    });
    // Copies every 100ms; a non-signing RPC would have given up after 2 of them.
    const signer = makeSigner(transport, { attemptTimeoutMs: 100, attempts: 2, signTimeoutMs: 5_000 });

    const signed = await signer.signEvent({ kind: 20013, content: 'seal', tags: [], created_at: 1 });
    expect(signed.kind).toBe(20013);
    expect(transport.published.length).toBeGreaterThanOrEqual(4);
    // Every copy is the same request: a signer queues and notifies it once.
    expect(new Set(await publishedRequestIds(transport)).size).toBe(1);
    expect(pendingSize(signer)).toBe(0);
  });

  it("doubles the gap between copies of an unanswered signature, up to a cap", async () => {
    const transport = makeFakeTransport();
    attachBunker(transport, async () => null);
    const times: number[] = [];
    const t0 = Date.now();
    transport.setOnPublish(() => times.push(Date.now() - t0));
    const signer = makeSigner(transport, { attemptTimeoutMs: 100, signTimeoutMs: 2_000 });

    await expect(signer.signEvent({ kind: 20013, content: '', tags: [], created_at: 1 })).rejects.toThrow(/timed out/);
    // Copies at ~0, 100, 300, 700, 1100, 1500, 1900 (gaps 100, 200, 400, then capped at 400);
    // a flat 100ms gap would have sent ~20.
    expect(times.length).toBeGreaterThanOrEqual(5);
    expect(times.length).toBeLessThanOrEqual(7);
    const gaps = times.slice(1).map((t, i) => t - times[i]);
    expect(gaps[1]).toBeGreaterThan(gaps[0] * 1.5);
    expect(Math.max(...gaps)).toBeLessThan(600);
  });

  it("keeps at most maxInFlight RPCs published, letting a signature ahead of queued decrypts", async () => {
    const transport = makeFakeTransport();
    const answer: (() => void)[] = [];
    const order: string[] = [];
    attachBunker(transport, (req) => {
      order.push(req.method);
      return new Promise((r) => answer.push(() => r({
        result: req.method === 'sign_event'
          ? JSON.stringify(finalizeEvent(JSON.parse(req.params[0]), bunkerSk))
          : 'plain',
      })));
    });
    const signer = makeSigner(transport, { attemptTimeoutMs: 60_000, maxInFlight: 2 });

    const decrypts = Array.from({ length: 5 }, () => signer.nip44.decrypt('aa'.repeat(32), 'ct'));
    await new Promise((r) => setTimeout(r, 50));
    expect(transport.published).toHaveLength(2);

    const sign = signer.signEvent({ kind: 20013, content: '', tags: [], created_at: 1 });
    await new Promise((r) => setTimeout(r, 50));
    expect(transport.published).toHaveLength(2);

    answer.shift()!();
    await new Promise((r) => setTimeout(r, 50));
    expect(order).toEqual(['nip44_decrypt', 'nip44_decrypt', 'sign_event']);

    while (answer.length > 0 || order.length < 6) {
      answer.shift()?.();
      await new Promise((r) => setTimeout(r, 20));
    }
    await expect(sign).resolves.toMatchObject({ kind: 20013 });
    await expect(Promise.all(decrypts)).resolves.toHaveLength(5);
    expect(pendingSize(signer)).toBe(0);
  });

  it("gives up on a signature after the sign budget", async () => {
    const transport = makeFakeTransport();
    attachBunker(transport, async () => null);
    const signer = makeSigner(transport, { attemptTimeoutMs: 100, signTimeoutMs: 350 });

    const t0 = Date.now();
    await expect(signer.signEvent({ kind: 20013, content: '', tags: [], created_at: 1 })).rejects.toThrow(/timed out/);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(340);
    expect(pendingSize(signer)).toBe(0);
  });

  it("re-publishes an outstanding request under its id to a relay that reconnected", async () => {
    const transport = makeFakeTransport();
    let answer: (() => void) | undefined;
    attachBunker(transport, (req) =>
      transport.published.length < 2
        ? Promise.resolve(null)
        : new Promise((r) => (answer = () => r({ result: `ok:${req.method}` }))),
    );
    const signer = makeSigner(transport, { attemptTimeoutMs: 60_000, signTimeoutMs: 120_000 });

    const pending = signer.signEvent({ kind: 20013, content: '', tags: [], created_at: 1 }).catch((e) => e);
    await new Promise((r) => setTimeout(r, 50));
    expect(transport.published).toHaveLength(1);

    transport.reopen('wss://bunker.example');
    await new Promise((r) => setTimeout(r, 50));
    expect(transport.published).toHaveLength(2);
    expect(transport.publishedTo[1]).toBe('wss://bunker.example');
    expect(new Set(await publishedRequestIds(transport)).size).toBe(1);
    answer?.();
    await pending;
    expect(pendingSize(signer)).toBe(0);
  });

  it("republishes the SAME signed event when an attempt goes unanswered", async () => {
    const transport = makeFakeTransport();
    let calls = 0;
    attachBunker(transport, async () => {
      calls++;
      if (calls === 1) return null; // first request 'lost'
      return { result: 'recovered' };
    });
    const signer = makeSigner(transport);

    await expect(signer.ping()).resolves.toBe('recovered');
    expect(transport.published).toHaveLength(2);
    // Byte-identical: a signer that handled the first copy drops the second by its id.
    expect(transport.published[1]).toEqual(transport.published[0]);
    expect(pendingSize(signer)).toBe(0);
  });

  it("re-signs a copy only once the event is old enough that its answer, not the request, may be lost", async () => {
    const transport = makeFakeTransport();
    attachBunker(transport, async () => null);
    // Gaps 100, 200, 400: copies at ~0, 100, 300 share the event; the one at ~700 is past the 400ms refresh.
    const signer = makeSigner(transport, { attemptTimeoutMs: 100, signTimeoutMs: 1_200 });

    // Fake time: on a loaded machine real 100ms gaps stretch past the refresh.
    vi.useFakeTimers();
    try {
      const settled = expect(signer.signEvent({ kind: 20013, content: '', tags: [], created_at: 1 })).rejects.toThrow(/timed out/);
      await vi.advanceTimersByTimeAsync(1_500);
      await settled;
    } finally {
      vi.useRealTimers();
    }
    const ids = transport.published.map((e) => e.id);
    expect(ids.length).toBeGreaterThanOrEqual(4);
    expect(new Set(ids.slice(0, 3)).size).toBe(1);
    expect(ids[3]).not.toBe(ids[0]);
    expect(new Set(await publishedRequestIds(transport)).size).toBe(1);
  });

  it("never re-prompts a signer that dedupes by event id after a once-only approval", async () => {
    // Amber: a 24133 whose id it has handled is dropped; one it hasn't is
    // processed afresh, and an approval the user did not remember ('this
    // time only') leaves nothing behind, so an unseen copy of an answered
    // request PROMPTS AGAIN. Returning to Armada fires a resend before the
    // answer has made its round trip. That is the loop, if the copy is new.
    const transport = makeFakeTransport();
    const handledEventIds = new Set<string>();
    let prompts = 0;
    attachBunker(transport, async (req, event) => {
      if (handledEventIds.has(event.id)) return null;
      handledEventIds.add(event.id);
      prompts++;
      // The user approves, then comes back to Armada while the answer is still in flight.
      if (prompts === 1) transport.reopen('wss://bunker.example');
      const tpl = JSON.parse(req.params[0]);
      return { result: JSON.stringify(finalizeEvent(tpl, bunkerSk)) };
    });
    const signer = makeSigner(transport, { attemptTimeoutMs: 60_000, signTimeoutMs: 120_000 });

    await expect(signer.signEvent({ kind: 20013, content: '', tags: [], created_at: 1 })).resolves.toMatchObject({
      kind: 20013,
    });
    await new Promise((r) => setTimeout(r, 50));
    // The copy went out (a signer that MISSED the first one needs it)...
    expect(transport.published).toHaveLength(2);
    // ...and the signer that didn't miss it saw nothing new.
    expect(prompts).toBe(1);
    expect(pendingSize(signer)).toBe(0);
  });

  it("re-signs a request still unanswered a few seconds after the user returns", async () => {
    // A signer that resubscribed with `since: now` never sees a copy dated at the first publish.
    const transport = makeFakeTransport();
    let answer: (() => void) | undefined;
    attachBunker(transport, (req, event) =>
      event.id === transport.published[0].id
        ? Promise.resolve(null)
        : new Promise((r) => (answer = () => r({ result: JSON.stringify(finalizeEvent(JSON.parse(req.params[0]), bunkerSk)) }))),
    );
    const signer = makeSigner(transport, { attemptTimeoutMs: 60_000, signTimeoutMs: 120_000 });

    vi.useFakeTimers();
    try {
      const pending = signer.signEvent({ kind: 20013, content: '', tags: [], created_at: 1 });
      await vi.advanceTimersByTimeAsync(10);
      expect(transport.published).toHaveLength(1);

      transport.resume();
      await vi.advanceTimersByTimeAsync(4_900);
      expect(transport.published).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(200);
      expect(transport.published).toHaveLength(2);
      expect(transport.published[1].id).not.toBe(transport.published[0].id);
      expect(new Set(await publishedRequestIds(transport)).size).toBe(1);

      answer?.();
      await expect(pending).resolves.toMatchObject({ kind: 20013 });
    } finally {
      vi.useRealTimers();
    }
    expect(pendingSize(signer)).toBe(0);
  });

  it("sends no re-signed copy when the answer lands within the grace after return", async () => {
    // Amber after a once-only approval: a new event would prompt again.
    const transport = makeFakeTransport();
    let answer: (() => void) | undefined;
    attachBunker(transport, (req) =>
      new Promise((r) => (answer = () => r({ result: JSON.stringify(finalizeEvent(JSON.parse(req.params[0]), bunkerSk)) }))),
    );
    const signer = makeSigner(transport, { attemptTimeoutMs: 60_000, signTimeoutMs: 120_000 });

    vi.useFakeTimers();
    try {
      const pending = signer.signEvent({ kind: 20013, content: '', tags: [], created_at: 1 });
      await vi.advanceTimersByTimeAsync(10);
      transport.resume();
      await vi.advanceTimersByTimeAsync(300);
      answer?.();
      await expect(pending).resolves.toMatchObject({ kind: 20013 });
      await vi.advanceTimersByTimeAsync(10_000);
    } finally {
      vi.useRealTimers();
    }
    expect(transport.published).toHaveLength(1);
  });

  it("does not re-sign a request first sent after the user returned", async () => {
    const transport = makeFakeTransport();
    attachBunker(transport, async () => null);
    const signer = makeSigner(transport, { attemptTimeoutMs: 60_000, signTimeoutMs: 120_000 });

    vi.useFakeTimers();
    try {
      const first = signer.signEvent({ kind: 20013, content: 'a', tags: [], created_at: 1 }).catch(() => undefined);
      await vi.advanceTimersByTimeAsync(10);
      transport.resume();
      const second = signer.signEvent({ kind: 20013, content: 'b', tags: [], created_at: 1 }).catch(() => undefined);
      await vi.advanceTimersByTimeAsync(5_100);
      // The first request was re-signed; the second, sent after the return, was not.
      expect(transport.published).toHaveLength(3);
      const ids = await publishedRequestIds(transport);
      expect(ids[2]).toBe(ids[0]);
      await vi.advanceTimersByTimeAsync(130_000);
      await Promise.all([first, second]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("fails after all attempts when the bunker stays silent", async () => {
    const transport = makeFakeTransport();
    attachBunker(transport, async () => null);
    const signer = makeSigner(transport, { attemptTimeoutMs: 150, attempts: 2 });

    await expect(signer.ping()).rejects.toThrow(/timed out/);
    expect(transport.published).toHaveLength(2);
    expect(pendingSize(signer)).toBe(0);
  });

  it("does NOT retry an explicit bunker error (no double prompts)", async () => {
    const transport = makeFakeTransport();
    let calls = 0;
    attachBunker(transport, async () => {
      calls++;
      return { error: 'user rejected' };
    });
    const signer = makeSigner(transport, { attempts: 2 });

    await expect(signer.ping()).rejects.toThrow('user rejected');
    expect(calls).toBe(1);
    expect(transport.published).toHaveLength(1);
    expect(pendingSize(signer)).toBe(0);
  });

  it("ignores stale responses for already-settled requests", async () => {
    const transport = makeFakeTransport();
    const bunkerSigner = new NSecSigner(bunkerSk);
    const clientPubkey = getPublicKey(clientSk);
    attachBunker(transport, async (_req) => ({ result: 'ok' }));
    const signer = makeSigner(transport);

    await expect(signer.ping()).resolves.toBe('ok');

    // A duplicate/late response with an unknown id must not throw or leak.
    const stale = await bunkerSigner.signEvent({
      kind: 24133,
      content: await bunkerSigner.nip44.encrypt(
        clientPubkey,
        JSON.stringify({ id: 'nobody-is-waiting-for-this', result: 'ok' }),
      ),
      created_at: Math.floor(Date.now() / 1000),
      tags: [['p', clientPubkey]],
    });
    transport.emit(stale);
    await new Promise((r) => setTimeout(r, 20));
    expect(pendingSize(signer)).toBe(0);
  });

  it("maps sign_psbt capability errors to the unsupported message", async () => {
    const transport = makeFakeTransport();
    attachBunker(transport, async () => ({ error: 'unknown method' }));
    const signer = makeSigner(transport);

    await expect(signer.signPsbt('70736274ff')).rejects.toThrow(/doesn't support sending Bitcoin/);
  });
});
