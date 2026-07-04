/**
 * nostr-push notification templates.
 *
 * Each entry becomes a separate server-side subscription with its own filter
 * and notification template. Templates use nostr-push's variable substitution:
 * {{author_name}}, {{content}}, {{amount}}.
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
 *
 * Text follows the Twitter convention: the title says WHO did WHAT to WHAT
 * ("Alice reacted to your post"), the body carries the content when the
 * event's content is human-readable.
 */
export const NOTIFICATION_TEMPLATES: NotificationTemplate[] = [
  {
    id: 'reactions',
    kinds: [7],
    title: '{{author_name}} reacted to your post',
    body: '{{content}}',
  },
  {
    id: 'reposts',
    kinds: [6, 16],
    // Kind 6 content is the reposted event's raw JSON — never show it.
    title: '{{author_name}} reposted your post',
    body: '',
  },
  {
    id: 'zaps',
    kinds: [9735],
    title: '{{author_name}} zapped you {{amount}} sats!',
    body: '',
  },
  {
    id: 'mentions',
    kinds: [1],
    title: '{{author_name}} mentioned you',
    body: '{{content}}',
  },
  {
    id: 'comments',
    kinds: [1111],
    title: '{{author_name}} commented on your post',
    body: '{{content}}',
  },
  {
    id: 'badges',
    kinds: [8],
    title: '{{author_name}} awarded you a badge!',
    body: 'You received a new badge.',
  },
  {
    id: 'letters',
    kinds: [8211],
    title: '{{author_name}} sent you a letter!',
    body: 'You have a new letter waiting for you.',
  },
  {
    id: 'highlights',
    kinds: [9802],
    title: '{{author_name}} highlighted your post',
    body: '{{content}}',
  },
];
