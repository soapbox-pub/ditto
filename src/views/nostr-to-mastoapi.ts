import { type Event } from '@/deps.ts';
import { getFollows } from '@/queries.ts';
import { isFollowing, nostrDate } from '@/utils.ts';
import { accountFromPubkey } from '@/views/mastodon/accounts.ts';
import { renderStatus } from '@/views/mastodon/statuses.ts';

async function toRelationship(sourcePubkey: string, targetPubkey: string) {
  const [source, target] = await Promise.all([
    getFollows(sourcePubkey),
    getFollows(targetPubkey),
  ]);

  return {
    id: targetPubkey,
    following: source ? isFollowing(source, targetPubkey) : false,
    showing_reblogs: true,
    notifying: false,
    followed_by: target ? isFollowing(target, sourcePubkey) : false,
    blocking: false,
    blocked_by: false,
    muting: false,
    muting_notifications: false,
    requested: false,
    domain_blocking: false,
    endorsed: false,
  };
}

function toNotification(event: Event, viewerPubkey?: string) {
  switch (event.kind) {
    case 1:
      return toNotificationMention(event as Event<1>, viewerPubkey);
  }
}

async function toNotificationMention(event: Event<1>, viewerPubkey?: string) {
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

export { accountFromPubkey, toNotification, toRelationship };
