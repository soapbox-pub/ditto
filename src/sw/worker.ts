/**
 * Ditto Service Worker
 *
 * Handles incoming push notifications and opens the app when the user taps
 * one. Built into a single self-contained `/sw.js` by the `serviceWorker()`
 * plugin in `vite.config.ts`, and registered as a classic worker by
 * `src/lib/push/serviceWorker.ts`.
 *
 * Two transports deliver here — the napp host (Tenna) and the nostr-push
 * service over Web Push — and both hand over the same thing (see
 * `src/lib/push/`): `{ $type: 'napp.push.payload', event_id, event?, relays }`,
 * the raw Nostr event, unverified and unrendered. Who deserves a notification,
 * what it says, and whose face is on it are all decided here, in
 * `handleNappPush()` below.
 *
 * `event` is the part that may be missing. On Android it never is, but a push
 * is a message on somebody else's transport and iOS gives the whole of one
 * four kilobytes, so an event longer than that arrives as `event_id` and the
 * relays to look for it on. `fetchEventById()` goes and gets it; when even that
 * fails, the id is still enough for a vaguer notification, which beats none.
 *
 * Neither transport is trusted to have matched correctly, so the worker
 * re-checks everything: the event must be validly signed (`parseEvent()`),
 * must match one of the filters the page asked for, must not come from the
 * user, and must come from someone they follow when "only from people I
 * follow" is on. The filters, the user and their follows are read from
 * IndexedDB, written by `src/lib/push/workerState.ts`.
 *
 * Spam handling — read this before touching the push handler. The other three
 * notification transports (in-app, Android, iOS) fetch a batch of events and
 * run TWO crowd-based detectors before deciding what to show: the reply-flood
 * detector (`src/lib/replyFlood.ts`, ported to Java + Swift), which reads
 * CONTENT, and the mention-swarm detector (`src/lib/mentionSwarm.ts`, likewise
 * ported), which reads the ENVELOPE — the co-tagged victim set and arrival
 * timing of a burst, the shape a mad-libs generator uses to defeat content
 * clustering. This service worker CANNOT run either: a push carries ONE event
 * at a time, so there is no thread, no author set, no crowd to measure
 * ECHO/DENSITY or a swarm's envelope against. The worker is also spun up
 * per-push and killed shortly after (so no in-memory state survives). What is
 * possible here is a much lighter same-shape burst counter, persisted in
 * IndexedDB across those short-lived invocations (`burst.ts`) — it catches an
 * identical-body DENSITY burst but not a mad-libs swarm, which is an accepted
 * gap in the push transport, not something a rewrite here can close.
 *
 * It also cannot silently drop a push: Chrome subscribes with
 * `userVisibleOnly: true` and revokes the push subscription after repeated
 * pushes that show no notification. So a detected burst is COLLAPSED, not
 * dropped — every payload in the burst reuses one shape-keyed tag with
 * `renotify: false`, so the wall overwrites itself in place as a single quiet
 * entry instead of buzzing N times. The first payloads of a burst (before the
 * threshold) still show normally; there is no way to know they were spam yet.
 */

import { isNostrId } from '@/lib/nostrId';
import { isValidZapReceipt } from '@/lib/zapReceipt';

import { notificationShape, recordAndCheckBurst } from './burst';
import { parseEvent } from './event';
import { NO_PROFILE, resolveProfile } from './profiles';
import { fetchEventById } from './relays';
import {
  eventIdPath,
  isWanted,
  MARK_READ_ACTION,
  notificationActions,
  type NotificationButton,
  notificationAuthor,
  notificationPath,
  NOTIFICATIONS_PATH,
  renderText,
  templateFor,
} from './render';
import { loadPushState } from './state';

declare const self: ServiceWorkerGlobalScope;

/**
 * `NotificationOptions` plus the fields lib.webworker leaves out. Chromium
 * honours both; the rest ignore them.
 */
interface ShowOptions extends NotificationOptions {
  renotify?: boolean;
  actions?: NotificationButton[];
}

function show(title: string, options: ShowOptions): Promise<void> {
  return self.registration.showNotification(title, options);
}

/** What the napp and nostr-push transports deliver. See `src/lib/push/types.ts`. */
interface NappPayload {
  $type?: string;
  event_id?: unknown;
  event?: unknown;
  relays?: unknown;
  /** Hosts before Tenna v0.8.1 sent a single relay. */
  relay?: unknown;
}

/** Rendered text from the pre-napp nostr-push server. */
interface LegacyPayload {
  title?: string;
  body?: string;
  icon?: string;
  badge?: string;
  data?: { subscription_id?: string; url?: string };
}

/**
 * Where the event came from, or where to look for it. `relays` is the current
 * shape; `relay`, a single string, is what hosts before Tenna v0.8.1 sent, and
 * costs one line to keep working.
 */
function nappRelays(payload: NappPayload): string[] {
  const relays: unknown[] = Array.isArray(payload.relays)
    ? payload.relays
    : (typeof payload.relay === 'string' ? [payload.relay] : []);

  return relays.filter((url): url is string => typeof url === 'string' && /^wss?:\/\//i.test(url));
}

/**
 * All that's left when an event can't be had: its id. Says that something
 * happened without saying what, which is the best a push of four kilobytes can
 * do for a note that didn't fit and that no relay would hand over.
 *
 * The check `isWanted()` makes — that the event matches one of our filters —
 * can't be made here, so this leans on the transport having matched them for
 * us. What it can't stand behind is "only from people I follow",
 * which the worker enforces for itself whenever the follow set is too big to
 * send. An occasional stranger getting through on this path is the price of
 * saying anything at all.
 */
async function showUnknownEventNotification(eventId: string, relays: string[]): Promise<void> {
  const title = 'New notification';
  const body = 'Open Ditto to see what happened.';
  const isBurst = await recordAndCheckBurst(notificationShape(body));

  await show(title, {
    body,
    icon: '/icon-192.png',
    badge: '/badge-96.png',
    // No kind to go on, so the event itself, wherever it turns out to be.
    data: { url: eventIdPath(eventId, relays), eventId },
    actions: notificationActions(null),
    requireInteraction: false,
    // The same tag the full notification would have used, so a later push
    // carrying the event replaces this one instead of doubling it.
    tag: `ditto-event-${eventId}`,
    renotify: !isBurst,
    silent: isBurst,
  });
}

/** Render and post a notification for one event handed over by the host. */
async function handleNappPush(payload: NappPayload): Promise<void> {
  const relays = nappRelays(payload);
  const eventId = isNostrId(payload.event_id) ? payload.event_id : null;

  let event = payload.event && typeof payload.event === 'object' ? parseEvent(payload.event) : null;

  // A push too large to carry the event carries its id and somewhere to look
  // for it instead. See NAPP.md.
  if (!event) {
    if (!eventId) return;
    event = await fetchEventById(relays, eventId, (candidate) => {
      const found = parseEvent(candidate);
      return found?.id === eventId ? found : null;
    });
    if (!event) return showUnknownEventNotification(eventId, relays);
  }

  const template = templateFor(event);
  if (!template) return; // A kind nothing subscribed to; the relay is confused.

  // A receipt's signature is the LNURL server's; the sender and amount come
  // from the zap request and invoice inside it, which must agree with it.
  if (event.kind === 9735 && !isValidZapReceipt(event)) return;

  const state = await loadPushState();
  if (!isWanted(event, state)) return;

  const author = notificationAuthor(event);
  const profile = relays.length ? await resolveProfile(relays, author) : NO_PROFILE;
  const { title, body } = renderText(event, template, profile.name);

  const shape = notificationShape(body || title);
  const isBurst = await recordAndCheckBurst(shape);

  await show(title, {
    body,
    icon: profile.picture ?? '/icon-192.png',
    badge: '/badge-96.png',
    // `data.url` is what routes a tap when no worker is alive to route it.
    data: { url: notificationPath(event, relays), eventId: event.id, kind: event.kind },
    // A collapsed burst is one entry standing for many; there's no single
    // event in it to answer.
    actions: notificationActions(isBurst ? null : event),
    requireInteraction: false,
    // Distinct events get distinct tags so none replaces another; a burst
    // collapses onto one shape-keyed tag instead (see the note up top).
    tag: isBurst ? `ditto-burst-${shape.slice(0, 64)}` : `ditto-event-${event.id}`,
    renotify: !isBurst,
    silent: isBurst,
  });
}

async function handleLegacyPush(payload: LegacyPayload): Promise<void> {
  const title = payload.title ?? 'Ditto';
  const body = payload.body ?? '';
  const shape = notificationShape(body);
  const isBurst = await recordAndCheckBurst(shape);

  await show(title, {
    body,
    icon: payload.icon ?? '/icon-192.png',
    badge: payload.badge ?? '/badge-96.png',
    data: payload.data ?? {},
    actions: notificationActions(null),
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
  });
}

// --- Push received ---

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload: NappPayload & LegacyPayload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'Ditto', body: event.data.text() };
  }
  if (!payload || typeof payload !== 'object') return;

  // Every transport hands over a raw Nostr event (or the id of one). A host
  // older than Tenna v0.8.1 doesn't send `$type`, and is recognized by the raw
  // event it puts in `event` instead. Anything else is rendered text from the
  // pre-napp nostr-push server, still arriving for a browser that hasn't
  // opened Ditto since, which moves it over; drawn as sent until then.
  const isNapp = payload.$type === 'napp.push.payload'
    || (typeof payload.event === 'object' && payload.event !== null);

  event.waitUntil(isNapp ? handleNappPush(payload) : handleLegacyPush(payload));
});

// --- Notification click ---

/**
 * The path a notification asked to open, if it's one of ours. `data.url` on a
 * legacy push came from the server, so only a same-origin path is honored.
 */
function clickPath(data: unknown): string {
  const url = data && typeof data === 'object' && 'url' in data && typeof data.url === 'string' ? data.url : '';
  if (!/^\/(?!\/)/.test(url)) return NOTIFICATIONS_PATH;
  try {
    const resolved = new URL(url, self.location.origin);
    if (resolved.origin !== self.location.origin) return NOTIFICATIONS_PATH;
    return resolved.pathname + resolved.search + resolved.hash;
  } catch {
    return NOTIFICATIONS_PATH;
  }
}

async function openPath(path: string): Promise<unknown> {
  const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  // Focus an existing Ditto tab if one is open
  for (const client of clientList) {
    if (new URL(client.url).origin === self.location.origin) {
      client.navigate(path);
      return client.focus();
    }
  }
  // Otherwise open a new tab
  return self.clients.openWindow(path);
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  // Mark read is the dismissal alone. Reply and a plain tap both open the
  // event; there's no inline reply field in web notifications, and the worker
  // couldn't sign one anyway.
  if (event.action === MARK_READ_ACTION) return;
  event.waitUntil(openPath(clickPath(event.notification.data)));
});

// --- Activate immediately ---

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});
