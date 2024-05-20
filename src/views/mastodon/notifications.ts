import { DittoEvent } from '@/interfaces/DittoEvent.ts';
import { nostrDate } from '@/utils.ts';
import { accountFromPubkey, renderAccount } from '@/views/mastodon/accounts.ts';
import { renderStatus } from '@/views/mastodon/statuses.ts';
import { NostrEvent } from '@nostrify/nostrify';

interface RenderNotificationOpts {
  viewerPubkey: string;
}

function renderNotification(event: DittoEvent, opts: RenderNotificationOpts) {
  const mentioned = !!event.tags.find(([name, value]) => name === 'p' && value === opts.viewerPubkey);

  if (event.kind === 1 && mentioned) {
    return renderMention(event, opts);
  }

  if (event.kind === 6) {
    return renderReblog(event, opts);
  }

  if (event.kind === 7 && event.content === '+') {
    return renderFavourite(event, opts);
  }

  if (event.kind === 7) {
    return renderReaction(event, opts);
  }
}

async function renderMention(event: DittoEvent, opts: RenderNotificationOpts) {
  const status = await renderStatus(event, opts);
  if (!status) return;

  return {
    id: notificationId(event),
    type: 'mention',
    created_at: nostrDate(event.created_at).toISOString(),
    account: status.account,
    status: status,
  };
}

async function renderReblog(event: DittoEvent, opts: RenderNotificationOpts) {
  if (event.repost?.kind !== 1) return;
  const status = await renderStatus(event.repost, opts);
  if (!status) return;
  const account = event.author ? await renderAccount(event.author) : accountFromPubkey(event.pubkey);

  return {
    id: notificationId(event),
    type: 'reblog',
    created_at: nostrDate(event.created_at).toISOString(),
    account,
    status,
  };
}

async function renderFavourite(event: DittoEvent, opts: RenderNotificationOpts) {
  if (event.reacted?.kind !== 1) return;
  const status = await renderStatus(event.reacted, opts);
  if (!status) return;
  const account = event.author ? await renderAccount(event.author) : accountFromPubkey(event.pubkey);

  return {
    id: notificationId(event),
    type: 'favourite',
    created_at: nostrDate(event.created_at).toISOString(),
    account,
    status,
  };
}

async function renderReaction(event: DittoEvent, opts: RenderNotificationOpts) {
  if (event.reacted?.kind !== 1) return;
  const status = await renderStatus(event.reacted, opts);
  if (!status) return;
  const account = event.author ? await renderAccount(event.author) : accountFromPubkey(event.pubkey);

  return {
    id: notificationId(event),
    type: 'pleroma:emoji_reaction',
    emoji: event.content,
    created_at: nostrDate(event.created_at).toISOString(),
    account,
    status,
  };
}

/** This helps notifications be sorted in the correct order. */
function notificationId({ id, created_at }: NostrEvent): string {
  return `${created_at}-${id}`;
}

export { renderNotification };
