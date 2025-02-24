import type { NostrEvent, NStore } from '@nostrify/nostrify';
import { nip19 } from 'nostr-tools';

import { MastodonPush } from '@/types/MastodonPush.ts';
import { renderNotification } from '@/views/mastodon/notifications.ts';

/**
 * Render a web push notification for the viewer.
 * Unlike other views, only one will be rendered at a time, so making use of async calls is okay.
 */
export async function renderWebPushNotification(
  store: NStore,
  event: NostrEvent,
  viewerPubkey: string,
): Promise<MastodonPush | undefined> {
  const notification = await renderNotification(store, event, { viewerPubkey });
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

  const name = account.display_name || account.username;

  switch (notification.type) {
    case 'ditto:name_grant':
      return `You were granted the name ${notification.name}`;
    case 'ditto:zap':
      return `${name} zapped you ${Math.floor(notification.amount / 1000)} sats`;
    case 'pleroma:emoji_reaction':
      return `${name} reacted to your post`;
    case 'favourite':
      return `${name} liked your post`;
    case 'mention':
      return `${name} mentioned you`;
    case 'reblog':
      return `${name} reposted your post`;
    default:
      return name;
  }
}
