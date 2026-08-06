/**
 * The shared "the user interacted with someone's post" domain signal.
 *
 * Reacting, replying, reposting and bookmarking are implemented in four
 * different places in Ditto, spread across a dozen surfaces (the feed card, the
 * thread page, profile feeds, search results, the quick-react popover, the
 * more menu). Anything that wants to know "did a real interaction just land"
 * — today the post-onboarding mission, tomorrow whatever else — must not have
 * to subscribe to a dozen buttons.
 *
 * So each action's **domain layer** reports one typed fact here the moment its
 * write is genuinely accepted:
 *
 *  - `useNostrPublish` classifies every event it successfully publishes, which
 *    covers reactions (kind 7), reposts (kinds 6/16), quote posts (a `q` tag),
 *    and replies (NIP-10 kind 1 / 1222, NIP-22 kind 1111 / 1244) from *every*
 *    surface at once, because all 160-odd publish sites go through it.
 *  - `useBookmarks` reports its own additions, because a kind 10003 bookmark
 *    list is a replaceable set whose `e` tags carry no author — the identity of
 *    the bookmarked post's author is only known at the call site.
 *
 * Three properties are load-bearing for consumers:
 *
 *  1. **Success, not intent.** Nothing is reported until the publish (or the
 *     bookmark write) has resolved. Opening a composer, opening the repost
 *     menu, or a publish that throws produce no signal at all.
 *  2. **Additive only.** Removing a reaction or a repost is a kind 5 deletion
 *     and is never classified; removing a bookmark is filtered out at the call
 *     site. Undoing something is not interacting with it.
 *  3. **Deduplicated.** One logical interaction produces one signal, however
 *     many callbacks, retries, echoes or Strict Mode double-invokes surround it.
 *
 * This is a plain module store rather than a `window` CustomEvent because it
 * must be typed, testable without a DOM, and impossible to forge from page
 * script. Consumers read it with `useSyncExternalStore`.
 */

import type { NostrEvent } from '@nostrify/nostrify';

/** The four ways a user can engage with somebody else's post. */
export type PostInteractionKind = 'reaction' | 'reply' | 'repost' | 'bookmark';

export interface PostInteraction {
  type: PostInteractionKind;
  /** The pubkey that performed the interaction. */
  actorPubkey: string;
  /** Event id (or address, for addressable targets) of the post interacted with. */
  targetEventId: string;
  /** Pubkey that authored the post being interacted with. */
  targetAuthorPubkey: string;
  /** Event id this interaction itself published, when it produced one. */
  publishedEventId?: string;
}

export interface PostInteractionSignal extends PostInteraction {
  /** Deduplication key — see {@link interactionKey}. */
  key: string;
  /** Epoch ms the signal was emitted. */
  at: number;
}

/** NIP-25 reaction. */
const REACTION_KIND = 7;
/** NIP-18 repost (kind 1 targets) and generic repost (everything else). */
const REPOST_KINDS = new Set([6, 16]);
/**
 * Kinds that can carry reply tags: NIP-10 text notes and voice messages, and
 * NIP-22 comments and voice comments.
 */
const REPLYABLE_KINDS = new Set([1, 1111, 1222, 1244]);

const HEX64 = /^[0-9a-f]{64}$/i;

function isPubkey(value: string | undefined): value is string {
  return typeof value === 'string' && HEX64.test(value);
}

/** Event ids are 64-hex; addressable targets are `kind:pubkey:d` coordinates. */
function isTargetId(value: string | undefined): value is string {
  if (typeof value !== 'string' || value.length === 0) return false;
  return HEX64.test(value) || /^\d+:[0-9a-f]{64}:/i.test(value);
}

/** Author of an addressable coordinate (`kind:pubkey:d`), if it is one. */
function addressAuthor(value: string): string | undefined {
  const parts = value.split(':');
  return parts.length >= 2 && isPubkey(parts[1]) ? parts[1] : undefined;
}

function lastTag(event: NostrEvent, name: string): string[] | undefined {
  let found: string[] | undefined;
  for (const tag of event.tags) {
    if (tag[0] === name) found = tag;
  }
  return found;
}

/**
 * The `e` tag naming the post a reply is *directly* answering.
 *
 * NIP-10's marked form is what Ditto writes: the parent carries the `reply`
 * marker, or the `root` marker when the parent is itself the thread root. The
 * unmarked fallback (last `e` tag = immediate parent) covers replies authored
 * by other clients that reach us through a rebroadcast.
 */
function replyParentTag(event: NostrEvent): string[] | undefined {
  const eTags = event.tags.filter((tag) => tag[0] === 'e' && isTargetId(tag[1]));
  if (eTags.length === 0) return undefined;
  return (
    eTags.find((tag) => tag[3] === 'reply') ??
    eTags.find((tag) => tag[3] === 'root') ??
    eTags[eTags.length - 1]
  );
}

/**
 * Resolve the target author for a reply.
 *
 * Preference order matters. The marked `e` tag's fifth element is an explicit
 * author hint for *that specific* post, so it is trusted first. A `p` tag is
 * only a fallback because Ditto copies the whole parent thread's `p` tags onto
 * a reply — picking one at random could name a bystander rather than the person
 * actually being replied to.
 */
function replyTargetAuthor(event: NostrEvent, parent: string[] | undefined): string | undefined {
  if (parent && isPubkey(parent[4])) return parent[4];
  if (parent && isTargetId(parent[1])) {
    const fromAddress = addressAuthor(parent[1]);
    if (fromAddress) return fromAddress;
  }
  const pTag = event.tags.find((tag) => tag[0] === 'p' && isPubkey(tag[1]) && tag[1] !== event.pubkey);
  return pTag?.[1];
}

/** A NIP-18 quote (`q` tag), which shares someone's post inside a new note. */
function quoteInteraction(event: NostrEvent): PostInteraction | undefined {
  const q = lastTag(event, 'q');
  if (!q || !isTargetId(q[1])) return undefined;
  const author = isPubkey(q[3]) ? q[3] : addressAuthor(q[1]);
  if (!author) return undefined;
  return {
    type: 'repost',
    actorPubkey: event.pubkey,
    targetEventId: q[1],
    targetAuthorPubkey: author,
    publishedEventId: event.id,
  };
}

/**
 * Classify a **successfully published** event as a post interaction, or return
 * `undefined` when it isn't one.
 *
 * Pure, so every rule below is testable without a relay:
 *
 * | Published event                        | Interaction |
 * |----------------------------------------|-------------|
 * | kind 7 with `e`/`p`                    | reaction    |
 * | kind 6 / 16 with `e`/`p`               | repost      |
 * | kind 1/1111/1222/1244 with reply tags  | reply       |
 * | kind 1 with a `q` tag (quote post)     | repost      |
 * | anything else                          | —           |
 *
 * Deletions (kind 5) are deliberately absent: un-reacting and un-reposting both
 * publish a deletion, and undoing an interaction is not an interaction. Kind
 * 10003 is absent too — bookmarks report themselves, see the module docs.
 *
 * A quote post counts as sharing, matching the product: `RepostMenu` offers
 * "Repost" and "Quote post" side by side as two ways to do the same thing. It
 * can also satisfy the separate `post-small` mission (a quote carries no `e`
 * tag, so it is still a root note) — two different missions recognising one
 * action is correct, and neither can be completed twice.
 */
export function classifyPublishedInteraction(event: NostrEvent): PostInteraction | undefined {
  if (!isPubkey(event.pubkey)) return undefined;

  if (event.kind === REACTION_KIND || REPOST_KINDS.has(event.kind)) {
    const e = lastTag(event, 'e');
    const p = lastTag(event, 'p');
    if (!e || !isTargetId(e[1])) return undefined;
    const author = isPubkey(p?.[1]) ? p![1] : addressAuthor(e[1]);
    if (!author) return undefined;
    return {
      type: event.kind === REACTION_KIND ? 'reaction' : 'repost',
      actorPubkey: event.pubkey,
      targetEventId: e[1],
      targetAuthorPubkey: author,
      publishedEventId: event.id,
    };
  }

  if (REPLYABLE_KINDS.has(event.kind)) {
    const parent = replyParentTag(event);
    if (parent) {
      const author = replyTargetAuthor(event, parent);
      if (!author) return undefined;
      return {
        type: 'reply',
        actorPubkey: event.pubkey,
        targetEventId: parent[1],
        targetAuthorPubkey: author,
        publishedEventId: event.id,
      };
    }
    // No reply tags: a root note, which is only an interaction when it quotes.
    return quoteInteraction(event);
  }

  return undefined;
}

/**
 * Deduplication key. Deliberately excludes the published event id, so the
 * *logical* interaction is the unit: swapping 👍 for ❤️ on the same post
 * publishes a second kind 7, but the user has still only engaged with that one
 * post in that one way, and consumers must not see it as new engagement.
 */
export function interactionKey(interaction: PostInteraction): string {
  return `${interaction.type}:${interaction.targetEventId}:${interaction.actorPubkey}`;
}

// ── Store ───────────────────────────────────────────────────────────────────

/**
 * How many recent signals stay readable. A consumer that mounts late (or whose
 * effect runs a tick after the emit) still sees what happened, and a long
 * session cannot grow this without bound.
 */
const MAX_SIGNALS = 20;

/** Keys already emitted this session, so one action can only ever land once. */
const emitted = new Set<string>();
/**
 * Ceiling on the dedup memory. Far above any plausible session's interactions,
 * and clearing wholesale (rather than evicting one) keeps this O(1) with no
 * ordering bookkeeping — the worst case is that a very old interaction could be
 * reported a second time after ~2000 distinct ones, which no consumer minds.
 */
const MAX_EMITTED_KEYS = 2_000;

let signals: readonly PostInteractionSignal[] = [];
const listeners = new Set<() => void>();

/**
 * Report a logically-successful interaction. Idempotent per
 * {@link interactionKey}: repeated calls for the same interaction — an
 * optimistic path plus a confirmed one, a relay echo, a remount, Strict Mode's
 * double-invoke — are dropped.
 *
 * Self-interactions are **not** filtered here. Whether interacting with your
 * own post counts is a consumer's policy, not a fact about what happened, and
 * the mission engine applies that rule where it can be seen and tested.
 */
export function emitPostInteraction(
  interaction: PostInteraction,
  now = Date.now(),
): void {
  if (!isPubkey(interaction.actorPubkey)) return;
  if (!isPubkey(interaction.targetAuthorPubkey)) return;
  if (!isTargetId(interaction.targetEventId)) return;

  const key = interactionKey(interaction);
  if (emitted.has(key)) return;
  if (emitted.size >= MAX_EMITTED_KEYS) emitted.clear();
  emitted.add(key);

  signals = [...signals, { ...interaction, key, at: now }].slice(-MAX_SIGNALS);
  for (const listener of listeners) listener();
}

/**
 * The recent interaction signals, newest last. The array identity only changes
 * when something is actually emitted, so this is safe as a `useSyncExternalStore`
 * snapshot and as an effect dependency.
 */
export function readPostInteractions(): readonly PostInteractionSignal[] {
  return signals;
}

export function subscribePostInteractions(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Test-only: forget every signal and dedup key. */
export function resetPostInteractions(): void {
  emitted.clear();
  signals = [];
  for (const listener of listeners) listener();
}
