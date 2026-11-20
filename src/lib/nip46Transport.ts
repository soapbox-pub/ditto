/**
 * Dedicated NIP-46 transport: one plain WebSocket per bunker relay, because
 * the app's relay pool wedges on Android (REQs never EOSE, EVENTs never acked)
 * where plain sockets don't. Behaviors: reconnect with capped backoff; on (re)open
 * re-send REQs then flush queued EVENTs; force-recycle after a long background
 * stint (Android leaves sockets half-open).
 */

import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';

type RelayMsg = ['EVENT', string, NostrEvent] | ['EOSE', string] | ['CLOSED', string, string];

interface ActiveSub {
  filters: NostrFilter[];
  push: (msg: RelayMsg) => void;
  /** Recent response ids already delivered (every relay carries every response). */
  seen: Set<string>;
}

/**
 * Response ids each subscription remembers. Copies of a response arrive
 * together, one per relay, so only recent ids matter, and a late copy of a
 * forgotten one is dropped by the signer as already settled.
 */
const MAX_SEEN = 256;

interface PendingOk {
  resolve: () => void;
  reject: (err: Error) => void;
  /** Relays that answered OK=false (all `targets` false ⇒ reject). */
  denied: Set<string>;
  targets: number;
}

/** Reconnect backoff: 1s, 2s, 4s, 8s, then 15s forever. */
const backoffMs = (attempt: number) => Math.min(1000 * 2 ** Math.min(attempt, 3), 15_000);

/** Recycle sockets on resume only after this long in the background. */
const RESUME_RECYCLE_MS = 45_000;

class RelayConn {
  private ws?: WebSocket;
  private attempt = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private queue: string[] = [];
  private stopped = false;
  private everOpened = false;

  constructor(
    readonly url: string,
    private onMessage: (url: string, data: string) => void,
    /** `reopened`: this relay had been open before, so frames sent since may be lost. */
    private onOpen: (url: string, reopened: boolean) => void,
  ) {
    this.connect();
  }

  private connect(): void {
    if (this.stopped) return;
    try {
      this.ws = new WebSocket(this.url);
    } catch {
      this.scheduleReconnect();
      return;
    }
    const ws = this.ws;
    ws.onopen = () => {
      this.attempt = 0;
      // Re-issue REQs BEFORE flushing queued frames: kind-24133 is ephemeral, so a
      // request must never precede the subscription its response needs.
      this.onOpen(this.url, this.everOpened);
      this.everOpened = true;
      const queued = this.queue;
      this.queue = [];
      for (const frame of queued) ws.send(frame);
    };
    ws.onmessage = (e) => {
      if (typeof e.data === 'string') this.onMessage(this.url, e.data);
    };
    ws.onclose = () => {
      this.scheduleReconnect();
    };
    ws.onerror = () => {
    };
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.timer) return;
    const wait = backoffMs(this.attempt++);
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.connect();
    }, wait);
  }

  send(frame: string): void {
    if (this.stopped) return;
    if (this.sendIfOpen(frame)) return;
    this.queue.push(frame);
  }

  /** Send `frame` only on an open socket; never queued. */
  sendIfOpen(frame: string): boolean {
    if (this.ws?.readyState !== WebSocket.OPEN) return false;
    try {
      this.ws.send(frame);
      return true;
    } catch {
      return false;
    }
  }

  /** Take one queued copy of `frame` back, unsent. Whether there was one. */
  unqueue(frame: string): boolean {
    const i = this.queue.indexOf(frame);
    if (i === -1) return false;
    this.queue.splice(i, 1);
    return true;
  }

  recycle(): void {
    try {
      this.ws?.close();
    } catch {
      this.scheduleReconnect();
    }
  }

  stop(): void {
    this.stopped = true;
    this.queue = [];
    if (this.timer) clearTimeout(this.timer);
    try {
      this.ws?.close();
    } catch { /* ignore */ }
  }

  get isOpen(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

export class Nip46Transport {
  private conns: RelayConn[];
  private subs = new Map<string, ActiveSub>();
  private pendingOks = new Map<string, PendingOk>();
  private backgroundedAt: number | undefined;
  private appStateHandle?: { remove: () => Promise<void> };
  private reopenListeners = new Set<(url: string) => void>();
  private resumeListeners = new Set<() => void>();
  private onVisibility?: () => void;

  constructor(relays: string[]) {
    this.conns = relays.map(
      (url) =>
        new RelayConn(url, (u, d) => this.route(u, d), (u, reopened) => {
          this.resubscribe(u);
          if (reopened) for (const fn of this.reopenListeners) fn(u);
        }),
    );
    if (Capacitor.isNativePlatform()) {
      void CapacitorApp.addListener('appStateChange', ({ isActive }) => {
        if (!isActive) {
          this.backgroundedAt = Date.now();
          return;
        }
        for (const fn of this.resumeListeners) fn();
        const away = this.backgroundedAt === undefined ? 0 : Date.now() - this.backgroundedAt;
        this.backgroundedAt = undefined;
        if (away < RESUME_RECYCLE_MS) return;
        for (const c of this.conns) c.recycle();
      }).then((handle) => {
        this.appStateHandle = handle;
      });
    } else if (typeof document !== 'undefined') {
      this.onVisibility = () => {
        if (document.visibilityState === 'visible') for (const fn of this.resumeListeners) fn();
      };
      document.addEventListener('visibilitychange', this.onVisibility);
    }
  }

  /** Called when the user returns to the app, typically from their signer app. */
  onResume(fn: () => void): () => void {
    this.resumeListeners.add(fn);
    return () => {
      this.resumeListeners.delete(fn);
    };
  }

  private route(url: string, data: string): void {
    let msg: unknown[];
    try {
      msg = JSON.parse(data) as unknown[];
    } catch {
      return;
    }
    switch (msg[0]) {
      case 'EVENT': {
        const [, subId, event] = msg as ['EVENT', string, NostrEvent];
        const sub = this.subs.get(subId);
        if (!sub || sub.seen.has(event.id)) return;
        sub.seen.add(event.id);
        if (sub.seen.size > MAX_SEEN) sub.seen.delete(sub.seen.values().next().value!);
        sub.push(['EVENT', subId, event]);
        return;
      }
      case 'EOSE': {
        const [, subId] = msg as ['EOSE', string];
        this.subs.get(subId)?.push(['EOSE', subId]);
        return;
      }
      case 'OK': {
        const [, id, ok, reason] = msg as ['OK', string, boolean, string?];
        const pending = this.pendingOks.get(id);
        if (!pending) return;
        if (ok) {
          this.pendingOks.delete(id);
          pending.resolve();
        } else {
          pending.denied.add(url);
          if (pending.denied.size >= pending.targets) {
            this.pendingOks.delete(id);
            pending.reject(new Error(reason || 'rejected by every relay'));
          }
        }
        return;
      }
      // CLOSED/AUTH/NOTICE ignored: 24133 isn't auth-gated on bunker relays, and a
      // CLOSED is handled by reconnect+resubscribe.
    }
  }

  private resubscribe(url: string): void {
    const conn = this.conns.find((c) => c.url === url);
    if (!conn) return;
    for (const [subId, sub] of this.subs) {
      conn.send(JSON.stringify(['REQ', subId, ...sub.filters]));
    }
  }

  /**
   * Called after a relay reconnects and its subscriptions are re-sent, so
   * requests published before the drop can be sent again to that relay.
   */
  onReopen(fn: (url: string) => void): () => void {
    this.reopenListeners.add(fn);
    return () => {
      this.reopenListeners.delete(fn);
    };
  }

  /** Publish to every relay (or only `opts.relay`); resolves on the first OK=true. */
  event(event: NostrEvent, opts?: { signal?: AbortSignal; relay?: string }): Promise<void> {
    const targets = opts?.relay ? this.conns.filter((c) => c.url === opts.relay) : this.conns;
    if (targets.length === 0) return Promise.reject(new Error(`unknown relay ${opts?.relay}`));
    const frame = JSON.stringify(['EVENT', event]);
    // A copy still queued for a relay that's down is settled now: it would
    // only be sent, stale, when that relay comes back.
    const unqueue = () => {
      for (const c of targets) c.unqueue(frame);
    };
    return new Promise<void>((resolve, reject) => {
      const done = (fn: () => void) => {
        opts?.signal?.removeEventListener('abort', onAbort);
        unqueue();
        fn();
      };
      const onAbort = () => {
        this.pendingOks.delete(event.id);
        unqueue();
        reject(new Error('publish aborted'));
      };
      this.pendingOks.set(event.id, {
        resolve: () => done(resolve),
        reject: (e) => done(() => reject(e)),
        denied: new Set(),
        targets: targets.length,
      });
      if (opts?.signal) {
        if (opts.signal.aborted) return onAbort();
        opts.signal.addEventListener('abort', onAbort, { once: true });
      }
      for (const c of targets) c.send(frame);
    });
  }

  /** Live subscription across all relays (deduped); ends only on abort. */
  req(
    filters: NostrFilter[],
    opts?: { signal?: AbortSignal },
  ): AsyncIterable<RelayMsg> {
    const subId = crypto.randomUUID();
    const subs = this.subs;
    const conns = this.conns;

    const queue: RelayMsg[] = [];
    let wake: (() => void) | undefined;
    let ended = false;

    const sub: ActiveSub = {
      filters,
      seen: new Set(),
      push: (msg) => {
        queue.push(msg);
        wake?.();
      },
    };
    subs.set(subId, sub);
    const frame = JSON.stringify(['REQ', subId, ...filters]);
    for (const c of conns) c.send(frame);

    const end = () => {
      if (ended) return;
      ended = true;
      subs.delete(subId);
      // A REQ still queued was never sent, and a socket that dropped took its
      // subscriptions with it: only an open socket has anything to CLOSE.
      const close = JSON.stringify(['CLOSE', subId]);
      for (const c of conns) {
        if (!c.unqueue(frame)) c.sendIfOpen(close);
      }
      wake?.();
    };
    opts?.signal?.addEventListener('abort', end, { once: true });
    if (opts?.signal?.aborted) end();

    return {
      async *[Symbol.asyncIterator]() {
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
  }

  /**
   * Stop every socket (no reconnects) and drop the app-state listener. For the
   * throwaway pairing transports; pending operations settle via their aborts.
   */
  close(): void {
    for (const c of this.conns) c.stop();
    // No socket is left to answer them.
    const pending = [...this.pendingOks.values()];
    this.pendingOks.clear();
    for (const p of pending) p.reject(new Error('transport closed'));
    void this.appStateHandle?.remove();
    this.appStateHandle = undefined;
    if (this.onVisibility) document.removeEventListener('visibilitychange', this.onVisibility);
    this.onVisibility = undefined;
  }

  /** Whether any bunker relay socket is OPEN (drives "approve in signer" vs "unreachable"). */
  isConnected(): boolean {
    return this.conns.some((c) => c.isOpen);
  }
}

/** One transport per bunker identity, shared by every signer that needs it. */
const transports = new Map<string, Nip46Transport>();

function transportKey(bunkerPubkey: string, relays: string[]): string {
  return `${bunkerPubkey}|${[...relays].sort().join(',')}`;
}

/**
 * App-wide transport per bunker pubkey + relay set (re-pairing with new relays
 * gets a fresh one). The superseded one is NOT closed here: another live login
 * may share the bunker pubkey with that relay set, and only the caller knows.
 */
export function getNip46Transport(bunkerPubkey: string, relays: string[]): Nip46Transport {
  const key = transportKey(bunkerPubkey, relays);
  let t = transports.get(key);
  if (!t) {
    t = new Nip46Transport(relays);
    transports.set(key, t);
  }
  return t;
}

/** Close and forget one shared transport (its login was removed). */
export function closeNip46Transport(bunkerPubkey: string, relays: string[]): void {
  const key = transportKey(bunkerPubkey, relays);
  transports.get(key)?.close();
  transports.delete(key);
}

/** Close and forget every shared transport no remaining bunker login uses. */
export function retainNip46Transports(sessions: { bunkerPubkey: string; relays: string[] }[]): void {
  const keep = new Set(sessions.map((s) => transportKey(s.bunkerPubkey, s.relays)));
  for (const [key, t] of transports) {
    if (keep.has(key)) continue;
    t.close();
    transports.delete(key);
  }
}

/** Close and forget every shared transport (logout). */
export function closeAllNip46Transports(): void {
  for (const t of transports.values()) t.close();
  transports.clear();
}
