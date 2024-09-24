import { NostrEvent } from '@nostrify/nostrify';

import { accountFromPubkey, renderAccount } from '@/views/mastodon/accounts.ts';
import { Conf } from '@/config.ts';
import { DittoEvent } from '@/interfaces/DittoEvent.ts';
import { nostrDate } from '@/utils.ts';
import { renderStatus } from '@/views/mastodon/statuses.ts';

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

  if (event.kind === 30360 && event.pubkey === Conf.pubkey) {
    return renderNameGrant(event);
  }

  if (event.kind === 9735) {
    return renderZap(event, opts);
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
  const account = event.author ? await renderAccount(event.author) : await accountFromPubkey(event.pubkey);

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
  const account = event.author ? await renderAccount(event.author) : await accountFromPubkey(event.pubkey);

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
  const account = event.author ? await renderAccount(event.author) : await accountFromPubkey(event.pubkey);

  return {
    id: notificationId(event),
    type: 'pleroma:emoji_reaction',
    emoji: event.content,
    emoji_url: event.tags.find(([name, value]) => name === 'emoji' && `:${value}:` === event.content)?.[2],
    created_at: nostrDate(event.created_at).toISOString(),
    account,
    status,
  };
}

async function renderNameGrant(event: DittoEvent) {
  const d = event.tags.find(([name]) => name === 'd')?.[1];
  const account = event.author ? await renderAccount(event.author) : await accountFromPubkey(event.pubkey);

  if (!d) return;

  return {
    id: notificationId(event),
    type: 'ditto:name_grant',
    name: d,
    created_at: nostrDate(event.created_at).toISOString(),
    account,
  };
}

async function renderZap(event: DittoEvent, opts: RenderNotificationOpts) {
  if (!event.zap_sender) return;

  const { zap_amount = 0, zap_message = '' } = event;
  if (zap_amount < 1) return;

  const account = typeof event.zap_sender !== 'string'
    ? await renderAccount(event.zap_sender)
    : await accountFromPubkey(event.zap_sender);

  return {
    id: notificationId(event),
    type: 'ditto:zap',
    amount: zap_amount,
    message: zap_message,
    created_at: nostrDate(event.created_at).toISOString(),
    account,
    ...(event.zapped ? { status: await renderStatus(event.zapped, opts) } : {}),
  };
}

/** This helps notifications be sorted in the correct order. */
function notificationId({ id, created_at }: NostrEvent): string {
  return `${created_at}-${id}`;
}

export { renderNotification };
