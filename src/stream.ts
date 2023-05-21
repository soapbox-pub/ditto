import { z } from '@/deps.ts';

/** Internal key for event subscriptions. */
type Topic =
  | `nostr:${string}:${string}`
  | 'public'
  | 'public:local';

/**
 * Streaming timelines/categories.
 * https://docs.joinmastodon.org/methods/streaming/#streams
 */
const streamSchema = z.enum([
  'nostr',
  'public',
  'public:local',
  'user',
]);

type Stream = z.infer<typeof streamSchema>;

/** Only the necessary metadata needed from the request. */
interface StreamConn {
  /** Hex pubkey parsed from the `Sec-Websocket-Protocol` header. */
  pubkey?: string;
  /** Base62 session UUID parsed from the `Sec-Websocket-Protocol` header. */
  session?: string;
  /** The WebSocket stream. */
  socket: WebSocket;
}

/** Requested streaming channel, eg `user`, `notifications`. Some channels like `hashtag` have additional params. */
// TODO: Make this a discriminated union (needed for hashtags).
interface StreamSub {
  /** Name of the channel, eg `user`. */
  stream: Stream;
  /** Additional query params, eg `tag`. */
  params?: Record<string, string>;
}

/** Class to organize WebSocket connections by topic. */
class WebSocketConnections {
  /** Set of WebSockets by topic. */
  #sockets = new Map<Topic, Set<WebSocket>>();
  /** Set of topics by WebSocket. We need to track this so we can unsubscribe properly. */
  #topics = new WeakMap<WebSocket, Set<Topic>>();

  /** Add the WebSocket to the streaming channel. */
  subscribe(conn: StreamConn, sub: StreamSub): void {
    const topic = getTopic(conn, sub);

    if (topic) {
      this.#addSocket(conn.socket, topic);
      this.#addTopic(conn.socket, topic);
    }
  }

  /** Remove the WebSocket from the streaming channel. */
  unsubscribe(conn: StreamConn, sub: StreamSub): void {
    const topic = getTopic(conn, sub);

    if (topic) {
      this.#removeSocket(conn.socket, topic);
      this.#removeTopic(conn.socket, topic);
    }
  }

  /** Remove the WebSocket from all its streaming channels. */
  unsubscribeAll(socket: WebSocket): void {
    const topics = this.#topics.get(socket);

    if (topics) {
      for (const topic of topics) {
        this.#removeSocket(socket, topic);
      }
    }

    this.#topics.delete(socket);
  }

  /** Get WebSockets for the given topic. */
  getSockets(topic: Topic): Set<WebSocket> {
    return this.#sockets.get(topic) ?? new Set<WebSocket>();
  }

  /** Add a WebSocket to a topics set in the state. */
  #addSocket(socket: WebSocket, topic: Topic): void {
    let subscribers = this.#sockets.get(topic);

    if (!subscribers) {
      subscribers = new Set<WebSocket>();
      this.#sockets.set(topic, subscribers);
    }

    subscribers.add(socket);
  }

  /** Remove a WebSocket from a topics set in the state. */
  #removeSocket(socket: WebSocket, topic: Topic): void {
    const subscribers = this.#sockets.get(topic);

    if (subscribers) {
      subscribers.delete(socket);

      if (subscribers.size === 0) {
        this.#sockets.delete(topic);
      }
    }
  }

  /** Add a topic to a WebSocket set in the state. */
  #addTopic(socket: WebSocket, topic: Topic): void {
    let topics = this.#topics.get(socket);

    if (!topics) {
      topics = new Set<Topic>();
      this.#topics.set(socket, topics);
    }

    topics.add(topic);
  }

  /** Remove a topic from a WebSocket set in the state. */
  #removeTopic(socket: WebSocket, topic: Topic): void {
    const topics = this.#topics.get(socket);

    if (topics) {
      topics.delete(topic);

      if (topics.size === 0) {
        this.#topics.delete(socket);
      }
    }
  }
}

/**
 * Convert the "stream" parameter into a "topic".
 * The stream parameter is part of the public-facing API, while the topic is internal.
 */
function getTopic(conn: StreamConn, sub: StreamSub): Topic | undefined {
  switch (sub.stream) {
    case 'public':
    case 'public:local':
      return sub.stream;
    default:
      if (!conn.pubkey) {
        return;
        // Nostr signing topics contain the session ID for privacy reasons.
      } else if (sub.stream === 'nostr') {
        return conn.session ? `nostr:${conn.pubkey}:${conn.session}` : undefined;
      }
  }
}

const ws = new WebSocketConnections();

export { type Stream, streamSchema, ws };
