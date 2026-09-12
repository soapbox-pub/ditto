// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0-or-later
// @source: https://gitlab.com/soapbox-pub/ditto
//
// The @license/@license-end pair is for GNU LibreJS. This file is copied
// verbatim from public/, so the vite.config.ts plugin that banners the bundled
// chunks never sees it. Nothing but whitespace may follow @license-end. Note
// that LibreJS's own manual acknowledges service workers as a source of false
// positives and negatives, so the tags here are best-effort.

/**
 * Ditto Service Worker
 *
 * Handles incoming push notifications and opens/focuses the app when the user
 * taps one. Two transports deliver here, and they hand over different things
 * (see `src/lib/push/`):
 *
 * - **nostr-push** — a server matched the event, rendered the text, and sent
 *   `{ title, body, icon, badge, data }`. There is nothing left to decide.
 * - **napp** — the host app (Tenna) held the relay subscription open and sends
 *   `{ event, relay, subscription }`: the raw Nostr event, unverified and
 *   unrendered. Everything the server would have done — who deserves a
 *   notification, what it says, whose face is on it — happens here, in
 *   `handleNappPush()` below.
 *
 * The napp path has no server to trust, so it re-checks what it can: the event
 * must tag the logged-in user, and must come from someone they follow when
 * "only from people I follow" is on. Both are read from IndexedDB, written by
 * `src/lib/push/nappWorkerState.ts`. What it cannot check is the signature —
 * the host doesn't verify before delivery and a worker has no secp256k1 — so a
 * hostile relay can still put words in a stranger's mouth. Tapping through
 * lands on /notifications, which is rendered from verified events.
 *
 * Spam handling — read this before touching the push handler. The other three
 * notification transports (in-app, Android, iOS) fetch a batch of events and
 * run TWO crowd-based detectors before deciding what to show: the reply-flood
 * detector (`src/lib/replyFlood.ts`, ported to Java + Swift), which reads
 * CONTENT, and the mention-swarm detector (`src/lib/mentionSwarm.ts`, likewise
 * ported), which reads the ENVELOPE — the co-tagged victim set and arrival
 * timing of a burst, the shape a mad-libs generator uses to defeat content
 * clustering. This service worker CANNOT run either: the nostr-push server
 * pushes ONE pre-rendered payload at a time, so there is no thread, no author
 * set, no crowd to measure ECHO/DENSITY against, and — fatal for mention-swarm
 * specifically — the payload is rendered text, not the raw event, so the `p`
 * tags and `created_at` the envelope rule needs are gone before the worker ever
 * sees it. The worker is also spun up per-push and killed shortly after (so no
 * in-memory state survives). What is possible here is a much lighter same-shape
 * burst counter, persisted in IndexedDB across those short-lived invocations —
 * it catches an identical-body DENSITY burst but not a mad-libs swarm, which is
 * an accepted gap in the push transport, not something a rewrite here can close.
 *
 * It also cannot silently drop a push: Chrome subscribes with
 * `userVisibleOnly: true` and revokes the push subscription after repeated
 * pushes that show no notification. So a detected burst is COLLAPSED, not
 * dropped — every payload in the burst reuses one shape-keyed tag with
 * `renotify: false`, so the wall overwrites itself in place as a single quiet
 * entry instead of buzzing N times. The first payloads of a burst (before the
 * threshold) still show normally; there is no way to know they were spam yet.
 */

// --- Burst suppression (IndexedDB-backed rolling shape window) ---

const BURST_DB = 'ditto-notif-burst';
const BURST_STORE = 'shapes';
/** How long a shape's copies are counted together. */
const BURST_WINDOW_MS = 10 * 60 * 1000;
/** Copies of one shape inside the window before it reads as a burst. */
const BURST_THRESHOLD = 3;
/** Prune anything older than this so the store can't grow without bound. */
const BURST_MAX_AGE_MS = 30 * 60 * 1000;

const URL_RUN = /https?:\/\/\S+/g;
const DIGIT_TOKEN = /[\p{L}\p{N}]*\p{N}[\p{L}\p{N}]*/gu;
const LETTER_RUN = /(\p{L})\1{2,}/gu;
const INVISIBLE = /[\u200b-\u200f\u2060\ufeff]/g;

/**
 * A coarse fingerprint of a notification body — a trimmed cousin of
 * `shapeKey()` in `src/lib/replyFlood.ts`, operating on the rendered push text
 * (the raw event content isn't available here). Collapses the parts that rotate
 * per copy (URLs, digits, held-down keys) so a pitch keeps one shape. Weaker
 * than the real detector: the payload prefixes the sender's display name, which
 * varies across an ECHO campaign, so this reliably catches the DENSITY case
 * (one key hammering an identical body) and identical-name repeats.
 */
function shapeKey(text) {
  return (text ?? '')
    .toLowerCase()
    .replace(INVISIBLE, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(URL_RUN, '@')
    .replace(DIGIT_TOKEN, '#')
    .replace(LETTER_RUN, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function openBurstDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(BURST_DB, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(BURST_STORE, { keyPath: 'shape' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Record one occurrence of `shape` and report whether its window count has
 * reached the burst threshold. Prunes stale rows on the way through. Never
 * throws — on any storage failure it reports "not a burst" so a real
 * notification is never swallowed by a broken store.
 */
async function recordAndCheckBurst(shape) {
  if (!shape) return false;
  try {
    const db = await openBurstDb();
    try {
      const tx = db.transaction(BURST_STORE, 'readwrite');
      const store = tx.objectStore(BURST_STORE);
      const now = Date.now();

      const existing = await idbRequest(store.get(shape));

      // Prune stale entries opportunistically (bounded work per push).
      const all = await idbRequest(store.getAll());
      for (const row of all) {
        if (now - row.lastSeen > BURST_MAX_AGE_MS) store.delete(row.shape);
      }

      let count;
      if (existing && now - existing.firstSeen <= BURST_WINDOW_MS) {
        count = existing.count + 1;
        store.put({ shape, count, firstSeen: existing.firstSeen, lastSeen: now });
      } else {
        // No prior copy, or the window lapsed — start a fresh window.
        count = 1;
        store.put({ shape, count, firstSeen: now, lastSeen: now });
      }

      await new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });

      return count >= BURST_THRESHOLD;
    } finally {
      db.close();
    }
  } catch {
    return false;
  }
}

// --- napp transport: rendering a raw event ---

/**
 * Notification copy per kind — the same nine entries as
 * `src/lib/notificationTemplates.ts`, which the nostr-push server renders from.
 * Duplicated rather than imported because this file is served verbatim from
 * public/ and never sees the bundler. Keep the two in step.
 *
 * English only. The server-rendered path is English too, so no notification
 * Ditto delivers while closed is localized; the in-app notification list is.
 */
const NAPP_TEMPLATES = [
  { kinds: [7], title: '%s reacted to your post', body: 'content' },
  // Kind 6 content is the reposted event's raw JSON — never show it.
  { kinds: [6, 16], title: '%s reposted your post', body: '' },
  { kinds: [9735], title: '%s zapped you %a sats!', body: '' },
  { kinds: [1], title: '%s mentioned you', body: 'content' },
  { kinds: [1111], title: '%s commented on your post', body: 'content' },
  { kinds: [8], title: '%s awarded you a badge!', body: 'You received a new badge.' },
  { kinds: [8211], title: '%s sent you a letter!', body: 'You have a new letter waiting for you.' },
  { kinds: [9802], title: '%s highlighted your post', body: 'content' },
  { kinds: [7849], title: '%s took your quiz', body: 'content' },
];

const NAPP_TEMPLATE_BY_KIND = new Map();
for (const template of NAPP_TEMPLATES) {
  for (const kind of template.kinds) NAPP_TEMPLATE_BY_KIND.set(kind, template);
}

/** Stand-in when the author's profile can't be resolved in time. */
const ANONYMOUS_NAME = 'Someone';
const MAX_BODY_LENGTH = 140;
const MAX_NAME_LENGTH = 40;

// Shared with src/lib/push/nappWorkerState.ts.
const STATE_DB = 'ditto-push-state';
const STATE_STORE = 'state';
const STATE_KEY = 'napp';

const PROFILE_DB = 'ditto-push-profiles';
const PROFILE_STORE = 'profiles';
/** How long a resolved profile is reused. */
const PROFILE_TTL_MS = 12 * 60 * 60 * 1000;
/** How long a failed lookup is remembered, so a burst doesn't retry per event. */
const PROFILE_MISS_TTL_MS = 30 * 60 * 1000;
/** Drop cached profiles nobody has needed in this long. */
const PROFILE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
/**
 * How long to wait for a kind 0. Deliberately short: the host binds a
 * notification's picture the first time it draws the row and never goes back
 * for it, so a face that arrives late is a face nobody sees — better a prompt
 * notification reading "Someone" than a slow one with a name on it.
 */
const PROFILE_TIMEOUT_MS = 2500;

function openDb(name, store) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(store)) db.createObjectStore(store);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** The user and follow set the page last published. Null when unavailable. */
async function loadNappState() {
  try {
    const db = await openDb(STATE_DB, STATE_STORE);
    try {
      const tx = db.transaction(STATE_STORE, 'readonly');
      return (await idbRequest(tx.objectStore(STATE_STORE).get(STATE_KEY))) ?? null;
    } finally {
      db.close();
    }
  } catch {
    return null;
  }
}

async function readCachedProfile(pubkey) {
  try {
    const db = await openDb(PROFILE_DB, PROFILE_STORE);
    try {
      const tx = db.transaction(PROFILE_STORE, 'readonly');
      const row = await idbRequest(tx.objectStore(PROFILE_STORE).get(pubkey));
      if (!row) return null;
      const ttl = row.name || row.picture ? PROFILE_TTL_MS : PROFILE_MISS_TTL_MS;
      if (Date.now() - row.fetchedAt > ttl) return null;
      return row;
    } finally {
      db.close();
    }
  } catch {
    return null;
  }
}

async function writeCachedProfile(pubkey, profile) {
  try {
    const db = await openDb(PROFILE_DB, PROFILE_STORE);
    try {
      const tx = db.transaction(PROFILE_STORE, 'readwrite');
      const store = tx.objectStore(PROFILE_STORE);
      const now = Date.now();
      store.put({ ...profile, pubkey, fetchedAt: now }, pubkey);

      // Opportunistic pruning — this store would otherwise grow with every
      // stranger who ever interacted with the user. One request, then
      // synchronous deletes, so the transaction never goes inactive waiting.
      const rows = await idbRequest(store.getAll());
      for (const row of rows) {
        if (row?.pubkey && now - row.fetchedAt > PROFILE_MAX_AGE_MS) store.delete(row.pubkey);
      }

      await new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
  } catch {
    // A broken cache costs a lookup next time, nothing more.
  }
}

function cleanName(value) {
  if (typeof value !== 'string') return null;
  const name = value.replace(/\s+/g, ' ').trim();
  if (!name) return null;
  return name.length > MAX_NAME_LENGTH ? `${name.slice(0, MAX_NAME_LENGTH - 1)}…` : name;
}

/** Only https: images are worth handing to the host; anything else it refuses. */
function cleanPicture(value) {
  if (typeof value !== 'string' || !value) return null;
  try {
    return new URL(value).protocol === 'https:' ? value : null;
  } catch {
    return null;
  }
}

/**
 * Ask one relay for an author's kind 0 over a short-lived socket. Resolves
 * `{ name, picture }` with nulls for whatever it couldn't find, and never
 * rejects — a nameless notification still beats no notification.
 */
function requestProfile(relay, pubkey) {
  return new Promise((resolve) => {
    let socket;
    let settled = false;

    const finish = (profile) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        socket?.close();
      } catch { /* already gone */ }
      resolve(profile ?? { name: null, picture: null });
    };

    const timer = setTimeout(() => finish(null), PROFILE_TIMEOUT_MS);

    try {
      socket = new WebSocket(relay);
    } catch {
      return finish(null);
    }

    const subId = `sw-profile-${Math.random().toString(36).slice(2, 10)}`;

    socket.onopen = () => {
      socket.send(JSON.stringify(['REQ', subId, { kinds: [0], authors: [pubkey], limit: 1 }]));
    };

    socket.onmessage = (message) => {
      let frame;
      try {
        frame = JSON.parse(message.data);
      } catch {
        return;
      }
      if (!Array.isArray(frame) || frame[1] !== subId) return;

      if (frame[0] === 'EVENT' && frame[2] && frame[2].kind === 0) {
        let metadata;
        try {
          metadata = JSON.parse(frame[2].content);
        } catch {
          return finish(null);
        }
        finish({
          name: cleanName(metadata.display_name) ?? cleanName(metadata.name),
          picture: cleanPicture(metadata.picture),
        });
      } else if (frame[0] === 'CLOSED' || frame[0] === 'EOSE') {
        finish(null);
      }
    };

    socket.onerror = () => finish(null);
    socket.onclose = () => finish(null);
  });
}

async function resolveProfile(relay, pubkey) {
  const cached = await readCachedProfile(pubkey);
  if (cached) return cached;
  const profile = await requestProfile(relay, pubkey);
  await writeCachedProfile(pubkey, profile);
  return profile;
}

/**
 * Nothing here trusts the event's shape. It arrives from a relay by way of the
 * host with no signature check and no schema, so every field is read as if it
 * might be missing or the wrong type.
 */
function firstTag(event, name) {
  if (!Array.isArray(event.tags)) return null;
  const tag = event.tags.find((t) => Array.isArray(t) && t[0] === name);
  return typeof tag?.[1] === 'string' ? tag[1] : null;
}

/** Sats encoded in a BOLT-11 invoice's human-readable part, or null. */
function bolt11Sats(invoice) {
  const match = /^ln(?:bc|tbs?|bcrt|sb)(\d+)([munp])?1/i.exec(invoice.trim());
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return null;
  const multiplier = { m: 1e-3, u: 1e-6, n: 1e-9, p: 1e-12 }[match[2]?.toLowerCase()] ?? 1;
  return Math.round(value * multiplier * 1e8);
}

/**
 * Who a notification is *from*. For a zap receipt that is the sender named in
 * the zap request, not the event's author — which is the lnurl server's key.
 */
function notificationAuthor(event) {
  if (event.kind !== 9735) return event.pubkey;
  const description = firstTag(event, 'description');
  if (!description) return event.pubkey;
  try {
    const request = JSON.parse(description);
    return typeof request.pubkey === 'string' ? request.pubkey : event.pubkey;
  } catch {
    return event.pubkey;
  }
}

function zapSats(event) {
  const bolt11 = firstTag(event, 'bolt11');
  const fromInvoice = bolt11 ? bolt11Sats(bolt11) : null;
  if (fromInvoice) return fromInvoice;

  // Fall back to the zap request's own `amount` tag, in millisats.
  const description = firstTag(event, 'description');
  if (!description) return null;
  try {
    const request = JSON.parse(description);
    const tags = Array.isArray(request.tags) ? request.tags : [];
    const amount = Number(tags.find((t) => Array.isArray(t) && t[0] === 'amount')?.[1]);
    return Number.isFinite(amount) && amount > 0 ? Math.round(amount / 1000) : null;
  } catch {
    return null;
  }
}

function truncateBody(content) {
  const text = (typeof content === 'string' ? content : '').replace(/\s+/g, ' ').trim();
  if (text.length <= MAX_BODY_LENGTH) return text;
  return `${text.slice(0, MAX_BODY_LENGTH - 1)}…`;
}

/** Whether this event is one the logged-in user asked to hear about. */
function isWanted(event, state) {
  if (!state?.pubkey) return true; // Nothing to check against — show it.

  const tags = Array.isArray(event.tags) ? event.tags : [];
  const tagsUser = tags.some((t) => Array.isArray(t) && t[0] === 'p' && t[1] === state.pubkey);
  if (!tagsUser) return false;

  if (state.onlyFollowing && state.follows?.length) {
    return state.follows.includes(notificationAuthor(event));
  }
  return true;
}

/** Render and post a notification for one raw event handed over by the host. */
async function handleNappPush(payload) {
  const event = payload.event;
  if (!event || typeof event !== 'object') return;
  if (typeof event.kind !== 'number' || !/^[0-9a-f]{64}$/.test(event.pubkey ?? '')) return;

  const template = NAPP_TEMPLATE_BY_KIND.get(event.kind);
  if (!template) return; // A kind nothing subscribed to; the relay is confused.

  const state = await loadNappState();
  if (!isWanted(event, state)) return;

  const author = notificationAuthor(event);
  const relay = typeof payload.relay === 'string' ? payload.relay : null;
  const profile = relay && /^[0-9a-f]{64}$/.test(author)
    ? await resolveProfile(relay, author)
    : { name: null, picture: null };

  const sats = event.kind === 9735 ? zapSats(event) : null;
  // Function replacements, so a display name containing `$&` or `$'` lands as
  // written instead of as a substitution pattern.
  const title = template.title
    .replace('%s', () => profile.name ?? ANONYMOUS_NAME)
    .replace('%a', () => (sats === null ? 'some' : sats.toLocaleString('en-US')));
  const body = template.body === 'content' ? truncateBody(event.content) : template.body;

  const shape = shapeKey(body || title);
  const isBurst = await recordAndCheckBurst(shape);

  await self.registration.showNotification(title, {
    body,
    icon: profile.picture ?? '/icon-192.png',
    badge: '/badge-96.png',
    // `data.url` is what routes a tap when no worker is alive to route it.
    data: { url: '/notifications', eventId: event.id, kind: event.kind },
    requireInteraction: false,
    // Distinct events get distinct tags so none replaces another; a burst
    // collapses onto one shape-keyed tag instead (see the note up top).
    tag: isBurst ? `ditto-burst-${shape.slice(0, 64)}` : `ditto-event-${event.id ?? shape}`,
    renotify: !isBurst,
    silent: isBurst,
  });
}

// --- Push received ---

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'Ditto', body: event.data.text() };
  }

  // napp hands over a raw Nostr event; nostr-push hands over rendered text.
  if (payload && typeof payload.event === 'object' && payload.event !== null) {
    event.waitUntil(handleNappPush(payload));
    return;
  }

  const title = payload.title ?? 'Ditto';
  const body = payload.body ?? '';

  event.waitUntil((async () => {
    const shape = shapeKey(body);
    const isBurst = await recordAndCheckBurst(shape);

    const options = {
      body,
      icon: payload.icon ?? '/icon-192.png',
      badge: payload.badge ?? '/badge-96.png',
      data: payload.data ?? {},
      requireInteraction: false,
      // A burst collapses onto one shape-keyed tag and stops re-alerting, so a
      // spam wall overwrites itself in place as a single quiet entry instead of
      // buzzing per copy. Normal notifications keep the per-subscription tag and
      // renotify so distinct interactions each alert.
      tag: isBurst
        ? `ditto-burst-${shape.slice(0, 64)}`
        : (payload.data?.subscription_id ?? 'ditto-notification'),
      renotify: !isBurst,
      silent: isBurst,
    };

    await self.registration.showNotification(title, options);
  })());
});

// --- Notification click ---

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Focus an existing Ditto tab if one is open
        for (const client of clientList) {
          if (new URL(client.url).origin === self.location.origin) {
            client.navigate('/notifications');
            return client.focus();
          }
        }
        // Otherwise open a new tab
        return self.clients.openWindow('/notifications');
      }),
  );
});

// --- Activate immediately ---

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});
// @license-end
