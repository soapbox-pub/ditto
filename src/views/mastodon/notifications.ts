import { type Event } from '@/deps.ts';
import { nostrDate } from '@/utils.ts';
import { accountFromPubkey } from '@/views/mastodon/accounts.ts';
import { renderStatus } from '@/views/mastodon/statuses.ts';

function renderNotification(event: Event, viewerPubkey?: string) {
  switch (event.kind) {
    case 1:
      return renderNotificationMention(event as Event<1>, viewerPubkey);
  }
}

async function renderNotificationMention(event: Event<1>, viewerPubkey?: string) {
  const status = await renderStatus(event, viewerPubkey);
  if (!status) return;

  return {
    id: event.id,
    type: 'mention',
    created_at: nostrDate(event.created_at).toISOString(),
    account: status.account,
    status: status,
  };
}

export { accountFromPubkey, renderNotification };
