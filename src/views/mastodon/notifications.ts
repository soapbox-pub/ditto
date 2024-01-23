import { type NostrEvent } from '@/deps.ts';
import { getAuthor } from '@/queries.ts';
import { nostrDate } from '@/utils.ts';
import { accountFromPubkey } from '@/views/mastodon/accounts.ts';
import { renderStatus } from '@/views/mastodon/statuses.ts';

function renderNotification(event: NostrEvent, viewerPubkey?: string) {
  switch (event.kind) {
    case 1:
      return renderNotificationMention(event, viewerPubkey);
  }
}

async function renderNotificationMention(event: NostrEvent, viewerPubkey?: string) {
  const author = await getAuthor(event.pubkey);
  const status = await renderStatus({ ...event, author }, viewerPubkey);
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
