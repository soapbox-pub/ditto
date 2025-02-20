import { type DittoConf } from '@ditto/conf';
import { relayConnectionsGauge, relayEventsCounter, relayMessagesCounter } from '@ditto/metrics';
import { MemoryRateLimiter, MultiRateLimiter, type RateLimiter } from '@ditto/ratelimiter';
import { logi } from '@soapbox/logi';
import { JsonValue } from '@std/json';
import {
  NKinds,
  NostrClientCLOSE,
  NostrClientCOUNT,
  NostrClientEVENT,
  NostrClientMsg,
  NostrClientREQ,
  NostrRelayMsg,
  NSchema as n,
} from '@nostrify/nostrify';

import { AppController } from '@/app.ts';
import { relayInfoController } from '@/controllers/nostr/relay-info.ts';
import * as pipeline from '@/pipeline.ts';
import { RelayError } from '@/RelayError.ts';
import { Storages } from '@/storages.ts';
import { errorJson } from '@/utils/log.ts';
import { purifyEvent } from '@/utils/purify.ts';
import { Time } from '@/utils/time.ts';

const limiters = {
  msg: new MemoryRateLimiter({ limit: 300, window: Time.minutes(1) }),
  req: new MultiRateLimiter([
    new MemoryRateLimiter({ limit: 15, window: Time.seconds(5) }),
    new MemoryRateLimiter({ limit: 300, window: Time.minutes(5) }),
    new MemoryRateLimiter({ limit: 1000, window: Time.hours(1) }),
  ]),
  event: new MultiRateLimiter([
    new MemoryRateLimiter({ limit: 10, window: Time.seconds(10) }),
    new MemoryRateLimiter({ limit: 100, window: Time.hours(1) }),
    new MemoryRateLimiter({ limit: 500, window: Time.days(1) }),
  ]),
  ephemeral: new MemoryRateLimiter({ limit: 30, window: Time.seconds(10) }),
};

/** Connections for metrics purposes. */
const connections = new Set<WebSocket>();

/** Set up the Websocket connection. */
function connectStream(socket: WebSocket, ip: string | undefined, conf: DittoConf) {
  const controllers = new Map<string, AbortController>();

  socket.onopen = () => {
    connections.add(socket);
    relayConnectionsGauge.set(connections.size);
  };

  socket.onmessage = (e) => {
    if (rateLimited(limiters.msg)) return;

    if (typeof e.data !== 'string') {
      socket.close(1003, 'Invalid message');
      return;
    }

    const result = n.json().pipe(n.clientMsg()).safeParse(e.data);

    if (result.success) {
      const msg = result.data;
      const verb = msg[0];

      logi({ level: 'trace', ns: 'ditto.relay.msg', verb, msg: msg as JsonValue, ip });
      relayMessagesCounter.inc({ verb });

      handleMsg(result.data);
    } else {
      relayMessagesCounter.inc();
      send(['NOTICE', 'Invalid message.']);
    }
  };

  socket.onclose = () => {
    connections.delete(socket);
    relayConnectionsGauge.set(connections.size);

    for (const controller of controllers.values()) {
      controller.abort();
    }
  };

  function rateLimited(limiter: Pick<RateLimiter, 'client'>): boolean {
    if (ip) {
      const client = limiter.client(ip);
      try {
        client.hit();
      } catch {
        socket.close(1008, 'Rate limit exceeded');
        return true;
      }
    }
    return false;
  }

  /** Handle client message. */
  function handleMsg(msg: NostrClientMsg) {
    switch (msg[0]) {
      case 'REQ':
        handleReq(msg);
        return;
      case 'EVENT':
        handleEvent(msg);
        return;
      case 'CLOSE':
        handleClose(msg);
        return;
      case 'COUNT':
        handleCount(msg);
        return;
    }
  }

  /** Handle REQ. Start a subscription. */
  async function handleReq([_, subId, ...filters]: NostrClientREQ): Promise<void> {
    if (rateLimited(limiters.req)) return;

    const controller = new AbortController();
    controllers.get(subId)?.abort();
    controllers.set(subId, controller);

    const store = await Storages.db();

    try {
      for await (const [verb, , ...rest] of store.req(filters, { limit: 100, timeout: conf.db.timeouts.relay })) {
        send([verb, subId, ...rest] as NostrRelayMsg);
      }
    } catch (e) {
      if (e instanceof RelayError) {
        send(['CLOSED', subId, e.message]);
      } else if (e instanceof Error && e.message.includes('timeout')) {
        send(['CLOSED', subId, 'error: the relay could not respond fast enough']);
      } else {
        send(['CLOSED', subId, 'error: something went wrong']);
      }
      controllers.delete(subId);
      return;
    }
  }

  /** Handle EVENT. Store the event. */
  async function handleEvent([_, event]: NostrClientEVENT): Promise<void> {
    relayEventsCounter.inc({ kind: event.kind.toString() });

    const limiter = NKinds.ephemeral(event.kind) ? limiters.ephemeral : limiters.event;
    if (rateLimited(limiter)) return;

    try {
      // This will store it (if eligible) and run other side-effects.
      await pipeline.handleEvent(purifyEvent(event), { source: 'relay', signal: AbortSignal.timeout(1000) });
      send(['OK', event.id, true, '']);
    } catch (e) {
      if (e instanceof RelayError) {
        send(['OK', event.id, false, e.message]);
      } else {
        send(['OK', event.id, false, 'error: something went wrong']);
        logi({ level: 'error', ns: 'ditto.relay', msg: 'Error in relay', error: errorJson(e), ip });
      }
    }
  }

  /** Handle CLOSE. Close the subscription. */
  function handleClose([_, subId]: NostrClientCLOSE): void {
    const controller = controllers.get(subId);
    if (controller) {
      controller.abort();
      controllers.delete(subId);
    }
  }

  /** Handle COUNT. Return the number of events matching the filters. */
  async function handleCount([_, subId, ...filters]: NostrClientCOUNT): Promise<void> {
    if (rateLimited(limiters.req)) return;
    const store = await Storages.db();
    const { count } = await store.count(filters, { timeout: conf.db.timeouts.relay });
    send(['COUNT', subId, { count, approximate: false }]);
  }

  /** Send a message back to the client. */
  function send(msg: NostrRelayMsg): void {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(msg));
    }
  }
}

const relayController: AppController = (c, next) => {
  const { conf } = c.var;
  const upgrade = c.req.header('upgrade');

  // NIP-11: https://github.com/nostr-protocol/nips/blob/master/11.md
  if (c.req.header('accept') === 'application/nostr+json') {
    return relayInfoController(c, next);
  }

  if (upgrade?.toLowerCase() !== 'websocket') {
    return c.text('Please use a Nostr client to connect.', 400);
  }

  let ip = c.req.header('x-real-ip');

  if (ip && conf.ipWhitelist.includes(ip)) {
    ip = undefined;
  }

  if (ip) {
    const remaining = Object
      .values(limiters)
      .reduce((acc, limiter) => Math.min(acc, limiter.client(ip).remaining), Infinity);

    if (remaining < 0) {
      return c.json({ error: 'Rate limit exceeded' }, 429);
    }
  }

  const { socket, response } = Deno.upgradeWebSocket(c.req.raw, { idleTimeout: 30 });
  connectStream(socket, ip, conf);

  return response;
};

export { relayController };
