/**
 * Notification templates shared between Web Push (nostr-push) and
 * Android native (NostrPoller.java) notification paths.
 *
 * Each entry defines a nostr-push subscription: the kinds to watch,
 * and the title/body templates using nostr-push's server-side variable
 * substitution ({{author_name}}, {{content}}, {{amount}}).
 *
 * Android equivalent in NostrPoller.java `kindToAction()`:
 *   kind 7      → "Someone reacted to your post"
 *   kind 6      → "Someone reposted your note"
 *   kind 16     → "Someone mentioned you" (default)
 *   kind 9735   → "Someone zapped you {amount} sats"
 *   kind 1      → "Someone replied to you" / "Someone mentioned you"
 *   kind 1111   → "Someone commented on your post" / "Someone replied to your comment"
 *
 * Web Push uses {{author_name}} instead of "Someone" since nostr-push
 * resolves the author's kind 0 display name server-side.
 *
 * Conditional logic (reply vs mention for kind 1, comment vs reply for
 * kind 1111) is not possible at the template level — nostr-push uses
 * static templates per subscription. We use the most common case.
 */

export interface NotificationTemplate {
  /** Suffix appended to the base subscription ID to make it unique. */
  id: string;
  /** Nostr event kinds this subscription watches. */
  kinds: number[];
  /** Notification title template. */
  title: string;
  /** Notification body template. */
  body: string;
}

/**
 * Notification subscriptions to register with nostr-push.
 * Each entry becomes a separate subscription with its own filter and template.
 */
export const NOTIFICATION_TEMPLATES: NotificationTemplate[] = [
  {
    id: 'reactions',
    kinds: [7],
    title: '{{author_name}} Reacted!',
    body: '{{content}}',
  },
  {
    id: 'reposts',
    kinds: [6, 16],
    title: '{{author_name}} Reposted!',
    body: '{{content}}',
  },
  {
    id: 'zaps',
    kinds: [9735],
    title: '{{amount}} sats!',
    body: '{{author_name}} zapped you',
  },
  {
    id: 'mentions',
    kinds: [1],
    title: '{{author_name}} Mentioned You!',
    body: '{{content}}',
  },
  {
    id: 'comments',
    kinds: [1111],
    title: '{{author_name}} Commented!',
    body: '{{content}}',
  },
];
