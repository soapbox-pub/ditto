/**
 * Shared NIP-46 transports are closed by their owner: a closed one stops its
 * sockets, settles its pending publishes, and is never handed out again.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { NostrEvent } from '@nostrify/nostrify';

class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static instances: FakeWebSocket[] = [];
  readyState = FakeWebSocket.CONNECTING;
  closed = false;
  onopen?: () => void;
  onclose?: () => void;
  onmessage?: (e: { data: string }) => void;
  onerror?: () => void;
  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
    queueMicrotask(() => {
      if (this.closed) return;
      this.readyState = FakeWebSocket.OPEN;
      this.onopen?.();
    });
  }
  send() {}
  close() {
    this.closed = true;
    this.readyState = FakeWebSocket.CLOSED;
  }
}

beforeEach(() => {
  FakeWebSocket.instances = [];
  vi.stubGlobal('WebSocket', FakeWebSocket);
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const BUNKER = 'b'.repeat(64);
const sockets = (match: string) => FakeWebSocket.instances.filter((ws) => ws.url.includes(match));

describe("nip46Transport lifecycle", () => {
  it("closeNip46Transport closes only that transport and forgets it", async () => {
    const { closeNip46Transport, getNip46Transport } = await import('@/lib/nip46Transport');
    const old = getNip46Transport(BUNKER, ['wss://old-a.example', 'wss://old-b.example']);
    const kept = getNip46Transport(BUNKER, ['wss://new.example']);
    await Promise.resolve();

    closeNip46Transport(BUNKER, ['wss://old-b.example', 'wss://old-a.example']);

    expect(sockets('old-').every((ws) => ws.closed)).toBe(true);
    expect(old.isConnected()).toBe(false);
    expect(sockets('new.').some((ws) => ws.closed)).toBe(false);
    expect(getNip46Transport(BUNKER, ['wss://new.example'])).toBe(kept);
    expect(getNip46Transport(BUNKER, ['wss://old-a.example', 'wss://old-b.example'])).not.toBe(old);
  });

  it("closeAllNip46Transports closes every shared transport", async () => {
    const { closeAllNip46Transports, getNip46Transport } = await import('@/lib/nip46Transport');
    const a = getNip46Transport(BUNKER, ['wss://a.example']);
    getNip46Transport('c'.repeat(64), ['wss://c.example']);
    await Promise.resolve();

    closeAllNip46Transports();

    expect(FakeWebSocket.instances.every((ws) => ws.closed)).toBe(true);
    expect(getNip46Transport(BUNKER, ['wss://a.example'])).not.toBe(a);
  });

  it("close() rejects publishes still waiting on an OK", async () => {
    const { Nip46Transport } = await import('@/lib/nip46Transport');
    const t = new Nip46Transport(['wss://silent.example']);
    const ev = { id: 'x', kind: 24133, pubkey: '', content: '', tags: [], created_at: 0, sig: '' } as NostrEvent;
    const pending = t.event(ev);
    t.close();
    await expect(pending).rejects.toThrow('transport closed');
    expect((t as unknown as { pendingOks: Map<string, unknown> }).pendingOks.size).toBe(0);
  });
});
