/**
 * Turning a raw event into a notification: whether to show it, what it says,
 * and where tapping it goes. Pure functions, so they can be tested without a
 * worker.
 */

import { createIntl, defineMessage, type IntlShape, type MessageDescriptor } from '@formatjs/intl';
import type { NostrEvent } from '@nostrify/nostrify';
import { matchFilters } from 'nostr-tools/filter';
import { decode as nip19Decode, neventEncode } from 'nostr-tools/nip19';

import { BADGE_DEFINITION_KIND, parseBadgeATag } from '@/lib/badgeUtils';
import { isNostrId } from '@/lib/nostrId';
import { getReferencedETag } from '@/lib/notificationTarget';
import type { PushWorkerLocale, PushWorkerState } from '@/lib/push/workerState';
import { tryNaddrEncode, tryNeventEncode } from '@/lib/safeNip19';
import { zapReceiptAmountMsat } from '@/lib/zapReceipt';

/** `LETTER_KIND` from `@/lib/letterTypes`, which is too entangled with the DOM to import here. */
const LETTER_KIND = 8211;

export interface NotificationTemplate {
  /** `{name}` is the author's name; a zap's also has `{amount}`. */
  title: MessageDescriptor;
  /** `'content'` for the event's own text, otherwise fixed copy or none. */
  body: 'content' | MessageDescriptor | null;
}

const REPOSTED = defineMessage({ id: 'pushNotification.reposted', defaultMessage: '{name} reposted your post' });

/**
 * Notification copy per kind, one entry for every kind in `NOTIFICATION_TYPES`
 * (`src/lib/notificationKinds.ts`), which the push filters are built from;
 * `render.test.ts` fails when the two drift. The native apps render the same
 * kinds in `NostrPoller.java` and `NostrPoller.swift`.
 *
 * Worded in the app's language: the page hands the worker its locale and these
 * ids' translations (`putPushWorkerLocale()`), since the worker can't load the
 * catalogs itself.
 */
export const TEMPLATES: ReadonlyMap<number, NotificationTemplate> = new Map<number, NotificationTemplate>([
  [7, {
    title: defineMessage({ id: 'pushNotification.reacted', defaultMessage: '{name} reacted to your post' }),
    body: 'content',
  }],
  // Kind 6 content is the reposted event's raw JSON — never show it.
  [6, { title: REPOSTED, body: null }],
  [16, { title: REPOSTED, body: null }],
  [9735, {
    title: defineMessage({ id: 'pushNotification.zapped', defaultMessage: '{name} zapped you {amount, number} sats!' }),
    body: null,
  }],
  // The amount is self-reported until checked on-chain, so it isn't shown.
  [8333, {
    title: defineMessage({ id: 'pushNotification.onchainZap', defaultMessage: '{name} sent you an on-chain zap' }),
    body: null,
  }],
  [1, {
    title: defineMessage({ id: 'pushNotification.mentioned', defaultMessage: '{name} mentioned you' }),
    body: 'content',
  }],
  [1111, {
    title: defineMessage({ id: 'pushNotification.commented', defaultMessage: '{name} commented on your post' }),
    body: 'content',
  }],
  // Voice content is an audio URL, not words.
  [1222, {
    title: defineMessage({ id: 'pushNotification.voiceMessage', defaultMessage: '{name} sent you a voice message' }),
    body: null,
  }],
  [1244, {
    title: defineMessage({ id: 'pushNotification.voiceReply', defaultMessage: '{name} replied with a voice message' }),
    body: null,
  }],
  [8, {
    title: defineMessage({ id: 'pushNotification.badge', defaultMessage: '{name} awarded you a badge!' }),
    body: defineMessage({ id: 'pushNotification.badgeBody', defaultMessage: 'You received a new badge.' }),
  }],
  [LETTER_KIND, {
    title: defineMessage({ id: 'pushNotification.letter', defaultMessage: '{name} sent you a letter!' }),
    body: defineMessage({ id: 'pushNotification.letterBody', defaultMessage: 'You have a new letter waiting for you.' }),
  }],
  [9802, {
    title: defineMessage({ id: 'pushNotification.highlighted', defaultMessage: '{name} highlighted your post' }),
    body: 'content',
  }],
  [7849, {
    title: defineMessage({ id: 'pushNotification.quiz', defaultMessage: '{name} took your quiz' }),
    body: 'content',
  }],
]);

/**
 * NIP-25 likes and dislikes. A `+` (or empty) reaction is a like and `-` is a
 * dislike; neither symbol means anything shown on its own, so they get their
 * own title and no body. Any other content is an emoji reaction and falls
 * through to the generic kind 7 template.
 */
const LIKE_TEMPLATE: NotificationTemplate = {
  title: defineMessage({ id: 'pushNotification.liked', defaultMessage: '{name} liked your post' }),
  body: null,
};
const DISLIKE_TEMPLATE: NotificationTemplate = {
  title: defineMessage({ id: 'pushNotification.disliked', defaultMessage: '{name} disliked your post' }),
  body: null,
};

/** A zap whose amount couldn't be read. */
const ZAPPED_SOME = defineMessage({ id: 'pushNotification.zappedSome', defaultMessage: '{name} zapped you some sats!' });

export function templateFor(event: NostrEvent): NotificationTemplate | undefined {
  if (event.kind === 7) {
    const content = event.content.trim();
    if (content === '+' || content === '') return LIKE_TEMPLATE;
    if (content === '-') return DISLIKE_TEMPLATE;
  }
  return TEMPLATES.get(event.kind);
}

/** Stand-in when the author's profile can't be resolved in time. */
const ANONYMOUS_NAME = defineMessage({ id: 'pushNotification.someone', defaultMessage: 'Someone' });
const MAX_BODY_LENGTH = 140;

/** Whether `value` is a well-formed BCP 47 tag, which `Intl` would accept. */
function isLocale(value: unknown): value is string {
  if (typeof value !== 'string' || !value) return false;
  try {
    return Intl.getCanonicalLocales(value).length === 1;
  } catch {
    return false;
  }
}

/** What notifications are worded with when the page never said otherwise. */
const ENGLISH = createNotificationIntl(null);

/**
 * An `IntlShape` for the locale and translations the page handed over (see
 * `putPushWorkerLocale()`). English, the inline defaults, without them: with
 * no translations to go on, a locale would only reformat the numbers inside
 * English sentences.
 */
export function createNotificationIntl(record: Partial<PushWorkerLocale> | null): IntlShape {
  const locale = record?.locale;
  const messages = record?.messages;
  const usable = isLocale(locale) && !!messages && typeof messages === 'object';
  return createIntl({
    locale: usable ? locale : 'en',
    defaultLocale: 'en',
    messages: usable ? messages : undefined,
    // A missing translation falls back to the English defaultMessage, as in the page.
    onError: (err) => {
      if (err.code !== 'MISSING_TRANSLATION') console.error(err);
    },
  });
}

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

/**
 * A NIP-21 `nostr:npub…` / `nostr:nprofile…` mention starting a token, so one
 * inside a URL (`https://ditto.pub/npub1…`, `…/nostr:npub1…`, `?u=nostr:…`)
 * stays part of the link. Mirrors `MENTION` in the Android `NotificationContent`.
 */
const MENTION = /(?<![^\s([{<"'])nostr:(?:npub1|nprofile1)[023456789acdefghjklmnpqrstuvwxyz]+/gi;

/** Most mentions resolved per note; any beyond keep their raw token. */
const MAX_MENTIONS = 8;

function mentionPubkey(token: string): string | null {
  try {
    const decoded = nip19Decode(token.slice('nostr:'.length).toLowerCase());
    if (decoded.type === 'npub') return decoded.data;
    if (decoded.type === 'nprofile') return decoded.data.pubkey;
  } catch { /* not a valid reference */ }
  return null;
}

/** The pubkeys `content` mentions, first occurrence first. */
export function mentionPubkeys(content: string): string[] {
  const pubkeys = new Set<string>();
  for (const [token] of content.matchAll(MENTION)) {
    const pubkey = mentionPubkey(token);
    if (pubkey) pubkeys.add(pubkey);
    if (pubkeys.size === MAX_MENTIONS) break;
  }
  return [...pubkeys];
}

/** `content` with each nameable mention as `@name`; the rest keep their raw token. */
export function resolveMentions(content: string, names: ReadonlyMap<string, string>): string {
  if (!names.size) return content;
  return content.replace(MENTION, (token) => {
    const pubkey = mentionPubkey(token);
    const name = pubkey && names.get(pubkey);
    return name ? `@${name}` : token;
  });
}

function truncateBody(content: string): string {
  const text = content.replace(/\s+/g, ' ').trim();
  if (text.length <= MAX_BODY_LENGTH) return text;
  return `${text.slice(0, MAX_BODY_LENGTH - 1)}…`;
}

/**
 * The title and body for `event` from `template`, naming its author `name` and
 * the people it mentions by `mentionNames`.
 */
export function renderText(
  event: NostrEvent,
  template: NotificationTemplate,
  name: string | null,
  mentionNames: ReadonlyMap<string, string> = new Map(),
  intl: IntlShape = ENGLISH,
): { title: string; body: string } {
  const sats = event.kind === 9735 ? zapSats(event) : null;
  const title = intl.formatMessage(event.kind === 9735 && sats === null ? ZAPPED_SOME : template.title, {
    name: name ?? intl.formatMessage(ANONYMOUS_NAME),
    amount: sats ?? 0,
  });
  let body = '';
  if (template.body === 'content') {
    body = truncateBody(resolveMentions(event.content, mentionNames));
  } else if (template.body) {
    body = intl.formatMessage(template.body);
  }
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

const MARK_READ = defineMessage({ id: 'pushNotification.markRead', defaultMessage: 'Mark read' });
const REPLY = defineMessage({ id: 'pushNotification.reply', defaultMessage: 'Reply' });

/** Notifications that are something said to the user, and so can be answered. */
const REPLYABLE_KINDS = new Set([1, 1111, 1222, 1244, 9802]);

/**
 * Buttons for the notification about `event`: Reply on the ones that are
 * something to reply to, Mark read on all. Chromium shows up to two; Safari
 * and Firefox show none, and the notification is still tappable.
 */
export function notificationActions(event: NostrEvent | null, intl: IntlShape = ENGLISH): NotificationButton[] {
  const markRead = { action: MARK_READ_ACTION, title: intl.formatMessage(MARK_READ) };
  return event && REPLYABLE_KINDS.has(event.kind)
    ? [{ action: REPLY_ACTION, title: intl.formatMessage(REPLY) }, markRead]
    : [markRead];
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
