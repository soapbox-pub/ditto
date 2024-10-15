/**
 * Mastodon push payload.
 *
 * This is the object the server sends to the client (with the Web Push API)
 * to notify of a new push event.
 */
export interface MastodonPush {
  access_token: string;
  preferred_locale?: string;
  notification_id: string;
  notification_type: string;
  icon?: string;
  title?: string;
  body?: string;
}
