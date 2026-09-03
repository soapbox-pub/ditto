/**
 * Ditto Service Worker
 *
 * Handles incoming Web Push notifications from the nostr-push server and
 * opens/focuses the app when the user taps a notification.
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

// --- Push received ---

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'Ditto', body: event.data.text() };
  }

  const title = payload.title ?? 'Ditto';
  const body = payload.body ?? '';

  event.waitUntil((async () => {
    const shape = shapeKey(body);
    const isBurst = await recordAndCheckBurst(shape);

    const options = {
      body,
      icon: payload.icon ?? '/icon-192.png',
      badge: payload.badge ?? '/icon-192.png',
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
