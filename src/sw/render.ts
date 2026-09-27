/**
 * Turning a raw event into a notification: whether to show it, what it says,
 * and where tapping it goes. Pure functions, so they can be tested without a
 * worker.
 */

import type { NostrEvent } from '@nostrify/nostrify';
import { matchFilters } from 'nostr-tools/filter';
import { neventEncode } from 'nostr-tools/nip19';

import { BADGE_DEFINITION_KIND, parseBadgeATag } from '@/lib/badgeUtils';
import { isNostrId } from '@/lib/nostrId';
import { getReferencedETag } from '@/lib/notificationTarget';
import type { PushWorkerState } from '@/lib/push/workerState';
import { tryNaddrEncode, tryNeventEncode } from '@/lib/safeNip19';
import { zapReceiptAmountMsat } from '@/lib/zapReceipt';

/** `LETTER_KIND` from `@/lib/letterTypes`, which is too entangled with the DOM to import here. */
const LETTER_KIND = 8211;

export interface NotificationTemplate {
  /** `%s` is the author's name, `%a` a zap's amount. */
  title: string;
  /** `'content'` for the event's own text, otherwise literal. */
  body: string;
}

/**
 * Notification copy per kind, one entry for every kind in `NOTIFICATION_TYPES`
 * (`src/lib/notificationKinds.ts`), which the push filters are built from;
 * `render.test.ts` fails when the two drift. The native apps render the same
 * kinds in `NostrPoller.java` and `NostrPoller.swift`.
 *
 * English only, as the native notifications are; the in-app notification list
 * is localized.
 */
export const TEMPLATES: ReadonlyMap<number, NotificationTemplate> = new Map([
  [7, { title: '%s reacted to your post', body: 'content' }],
  // Kind 6 content is the reposted event's raw JSON — never show it.
  [6, { title: '%s reposted your post', body: '' }],
  [16, { title: '%s reposted your post', body: '' }],
  [9735, { title: '%s zapped you %a sats!', body: '' }],
  // The amount is self-reported until checked on-chain, so it isn't shown.
  [8333, { title: '%s sent you an on-chain zap', body: '' }],
  [1, { title: '%s mentioned you', body: 'content' }],
  [1111, { title: '%s commented on your post', body: 'content' }],
  // Voice content is an audio URL, not words.
  [1222, { title: '%s sent you a voice message', body: '' }],
  [1244, { title: '%s replied with a voice message', body: '' }],
  [8, { title: '%s awarded you a badge!', body: 'You received a new badge.' }],
  [LETTER_KIND, { title: '%s sent you a letter!', body: 'You have a new letter waiting for you.' }],
  [9802, { title: '%s highlighted your post', body: 'content' }],
  [7849, { title: '%s took your quiz', body: 'content' }],
]);

/**
 * NIP-25 likes and dislikes. A `+` (or empty) reaction is a like and `-` is a
 * dislike; neither symbol means anything shown on its own, so they get their
 * own title and no body. Any other content is an emoji reaction and falls
 * through to the generic kind 7 template.
 */
const LIKE_TEMPLATE: NotificationTemplate = { title: '%s liked your post', body: '' };
const DISLIKE_TEMPLATE: NotificationTemplate = { title: '%s disliked your post', body: '' };

export function templateFor(event: NostrEvent): NotificationTemplate | undefined {
  if (event.kind === 7) {
    const content = event.content.trim();
    if (content === '+' || content === '') return LIKE_TEMPLATE;
    if (content === '-') return DISLIKE_TEMPLATE;
  }
  return TEMPLATES.get(event.kind);
}

/** Stand-in when the author's profile can't be resolved in time. */
const ANONYMOUS_NAME = 'Someone';
const MAX_BODY_LENGTH = 140;

function firstTag(event: NostrEvent, name: string): string | undefined {
  return event.tags.find(([n]) => n === name)?.[1];
}

/** The kind 9734 zap request embedded in a receipt, unverified. */
function zapRequest(event: NostrEvent): { pubkey?: unknown; tags?: unknown } | null {
  const description = firstTag(event, 'description');
  if (!description) return null;
  try {
    const request = JSON.parse(description);
    return request && typeof request === 'object' ? request : null;
  } catch {
    return null;
  }
}

/**
 * Who a notification is *from*. For a zap receipt that is the sender named in
 * the zap request, not the event's author — which is the lnurl server's key.
 */
export function notificationAuthor(event: NostrEvent): string {
  if (event.kind !== 9735) return event.pubkey;
  const request = zapRequest(event);
  return isNostrId(request?.pubkey) ? request.pubkey : event.pubkey;
}

function zapSats(event: NostrEvent): number | null {
  const msat = zapReceiptAmountMsat(event);
  if (msat) return Math.round(msat / 1000);

  // Fall back to the zap request's own `amount` tag, in millisats.
  const tags = zapRequest(event)?.tags;
  if (!Array.isArray(tags)) return null;
  const amount = Number(tags.find((t) => Array.isArray(t) && t[0] === 'amount')?.[1]);
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount / 1000) : null;
}

function truncateBody(content: string): string {
  const text = content.replace(/\s+/g, ' ').trim();
  if (text.length <= MAX_BODY_LENGTH) return text;
  return `${text.slice(0, MAX_BODY_LENGTH - 1)}…`;
}

/** The title and body for `event` from `template`, naming its author `name`. */
export function renderText(
  event: NostrEvent,
  template: NotificationTemplate,
  name: string | null,
): { title: string; body: string } {
  const sats = event.kind === 9735 ? zapSats(event) : null;
  // Function replacements, so a display name containing `$&` or `$'` lands as
  // written instead of as a substitution pattern.
  const title = template.title
    .replace('%s', () => name ?? ANONYMOUS_NAME)
    .replace('%a', () => (sats === null ? 'some' : sats.toLocaleString('en-US')));
  const body = template.body === 'content' ? truncateBody(event.content) : template.body;
  return { title, body };
}

/** Whether this event is one the logged-in user asked to hear about. */
export function isWanted(event: NostrEvent, state: Partial<PushWorkerState> | null): boolean {
  if (!state?.pubkey) return true; // Nothing to check against — show it.

  if (Array.isArray(state.subscriptions)) {
    const matched = state.subscriptions.some((sub) =>
      Array.isArray(sub?.filters) && matchFilters(sub.filters, event));
    if (!matched) return false;
  } else {
    // State written by a page from before the filters were stored: every
    // filter then named the user in `#p`, so that is the check.
    if (!event.tags.some(([name, value]) => name === 'p' && value === state.pubkey)) return false;
  }

  // Commenting on, reacting to, or zapping your own post tags you too.
  const author = notificationAuthor(event);
  if (author === state.pubkey) return false;

  // A zap receipt is checked for its sender and its signer both, so muting a
  // wallet provider silences it too.
  if (state.muted?.length && (state.muted.includes(author) || state.muted.includes(event.pubkey))) return false;

  if (state.onlyFollowing && state.follows?.length) {
    return state.follows.includes(author);
  }
  return true;
}

// --- Action buttons ---

/** A notification action button. lib.webworker doesn't declare it. */
export interface NotificationButton {
  action: string;
  title: string;
}

/** Opens the event, exactly as tapping the notification does. */
export const REPLY_ACTION = 'reply';
/** Dismisses the notification. The in-app read cursor lives in encrypted, signed settings the worker can't write. */
export const MARK_READ_ACTION = 'mark-read';

const MARK_READ: NotificationButton = { action: MARK_READ_ACTION, title: 'Mark read' };
const REPLY: NotificationButton = { action: REPLY_ACTION, title: 'Reply' };

/** Notifications that are something said to the user, and so can be answered. */
const REPLYABLE_KINDS = new Set([1, 1111, 1222, 1244, 9802]);

/**
 * Buttons for the notification about `event`: Reply on the ones that are
 * something to reply to, Mark read on all. Chromium shows up to two; Safari
 * and Firefox show none, and the notification is still tappable.
 */
export function notificationActions(event: NostrEvent | null): NotificationButton[] {
  return event && REPLYABLE_KINDS.has(event.kind) ? [REPLY, MARK_READ] : [MARK_READ];
}

// --- Where a tap goes ---

export const NOTIFICATIONS_PATH = '/notifications';

/** Notifications that are about one of the user's posts rather than being one. */
const TARGET_KINDS = new Set([6, 7, 16, 8333, 9735]);

/** Relays worth putting in a link: the first couple the event was actually seen on. */
function relayHints(relays: string[]): string[] {
  const encoder = new TextEncoder();
  return relays.slice(0, 2).filter((url) => encoder.encode(url).length <= 255);
}

/** An `nevent` path for an event known only by id, as when a push was too big to carry it. */
export function eventIdPath(id: string, relays: string[]): string {
  const nevent = tryNeventEncode({ id, relays: relayHints(relays) });
  return nevent ? `/${nevent}` : NOTIFICATIONS_PATH;
}

/**
 * Where tapping the notification for `event` lands: the post a reaction,
 * repost or zap is on; the reply, mention, comment, highlight or quiz result
 * itself; the awarded badge; the letters inbox. Mirrors where the in-app list
 * sends each row. /notifications when there's nothing more specific.
 *
 * The event itself is verified, but what its tags point at isn't — that's
 * fine, since these are links, not content: the page fetches the target and
 * verifies it like any other event.
 */
export function notificationPath(event: NostrEvent, relays: string[]): string {
  if (event.kind === LETTER_KIND) return '/letters';

  if (event.kind === 8) {
    const badge = parseBadgeATag(event);
    const naddr = badge && tryNaddrEncode({ kind: BADGE_DEFINITION_KIND, ...badge });
    return naddr ? `/${naddr}` : NOTIFICATIONS_PATH;
  }

  if (TARGET_KINDS.has(event.kind)) {
    const tag = getReferencedETag(event);
    if (!tag) return NOTIFICATIONS_PATH;
    // The author hint sits at index 4 in NIP-10's marked form and 3 in NIP-25's.
    const author = [tag[4], tag[3]].find((value) => isNostrId(value));
    const nevent = tryNeventEncode({ id: tag[1], author });
    return nevent ? `/${nevent}` : NOTIFICATIONS_PATH;
  }

  return `/${neventEncode({
    id: event.id,
    relays: relayHints(relays),
    author: event.pubkey,
    kind: event.kind,
  })}`;
}
