import type { NostrEvent } from '@nostrify/nostrify';
import { nip19 } from 'nostr-tools';

import { MastodonPush } from '@/types/MastodonPush.ts';
import { renderNotification } from '@/views/mastodon/notifications.ts';

/**
 * Render a web push notification for the viewer.
 * Unlike other views, only one will be rendered at a time, so making use of async calls is okay.
 */
export async function renderWebPushNotification(
  event: NostrEvent,
  viewerPubkey: string,
): Promise<MastodonPush | undefined> {
  const notification = await renderNotification(event, { viewerPubkey });
  if (!notification) {
    return;
  }

  return {
    notification_id: notification.id,
    notification_type: notification.type,
    access_token: nip19.npubEncode(viewerPubkey),
    preferred_locale: 'en',
    title: renderTitle(notification),
    icon: notification.account.avatar_static,
    body: event.content,
  };
}

type MastodonNotification = NonNullable<Awaited<ReturnType<typeof renderNotification>>>;

function renderTitle(notification: MastodonNotification): string {
  const { account } = notification;

  switch (notification.type) {
    case 'ditto:name_grant':
      return `You were granted the name ${notification.name}`;
    case 'ditto:zap':
      return `${account.display_name} zapped you ${notification.amount} sats`;
    case 'pleroma:emoji_reaction':
      return `${account.display_name} reacted to your post`;
    case 'favourite':
      return `${account.display_name} liked your post`;
    case 'mention':
      return `${account.display_name} mentioned you`;
    case 'reblog':
      return `${account.display_name} reposted your post`;
    default:
      return account.display_name || account.username;
  }
}
