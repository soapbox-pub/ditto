type Topic = string;

interface StreamConn {
  pubkey?: string;
  session?: string;
  socket: WebSocket;
}

// TODO: Make this a discriminated union (needed for hashtags).
interface Stream {
  name: string;
  params?: Record<string, string>;
}

const sockets = new Map<Topic, Set<WebSocket>>();

function addSocket(socket: WebSocket, topic: Topic): void {
  let subscribers = sockets.get(topic);
  if (!subscribers) {
    subscribers = new Set<WebSocket>();
    sockets.set(topic, subscribers);
  }
  subscribers.add(socket);
}

function removeSocket(socket: WebSocket, topic: Topic): void {
  const subscribers = sockets.get(topic);
  if (subscribers) {
    subscribers.delete(socket);
    if (subscribers.size === 0) {
      sockets.delete(topic);
    }
  }
}

function subscribe(conn: StreamConn, stream: Stream): void {
  const topic = getTopic(conn, stream);
  if (topic) {
    addSocket(conn.socket, topic);
  }
}

function unsubscribe(conn: StreamConn, stream: Stream): void {
  const topic = getTopic(conn, stream);
  if (topic) {
    removeSocket(conn.socket, topic);
  }
}

/**
 * Convert the "stream" parameter into a "topic".
 * The stream parameter is part of the public-facing API, while the topic is internal.
 */
function getTopic(conn: StreamConn, stream: Stream): Topic | undefined {
  // Global topics will share the same name as the stream.
  if (stream.name.startsWith('public')) {
    return stream.name;
    // Can't subscribe to non-public topics without a pubkey.
  } else if (!conn.pubkey) {
    return;
    // Nostr signing topics contain the session ID for privacy reasons.
  } else if (stream.name === 'nostr') {
    return conn.session ? `${stream.name}:${conn.pubkey}:${conn.session}` : undefined;
    // User topics will be suffixed with the pubkey.
  } else {
    return `${stream.name}:${conn.pubkey}`;
  }
}

function getSockets(topic: Topic): Set<WebSocket> {
  return sockets.get(topic) ?? new Set<WebSocket>();
}

const ws = {
  subscribe,
  unsubscribe,
  getSockets,
};

export default ws;
