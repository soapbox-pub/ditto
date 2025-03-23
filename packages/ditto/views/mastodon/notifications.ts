import { NostrEvent, NStore } from '@nostrify/nostrify';

import { accountFromPubkey, renderAccount } from '@/views/mastodon/accounts.ts';
import { Conf } from '@/config.ts';
import { DittoEvent } from '@/interfaces/DittoEvent.ts';
import { nostrDate } from '@/utils.ts';
import { renderStatus } from '@/views/mastodon/statuses.ts';

interface RenderNotificationOpts {
  viewerPubkey: string;
}

async function renderNotification(store: NStore, event: DittoEvent, opts: RenderNotificationOpts) {
  const mentioned = !!event.tags.find(([name, value]) => name === 'p' && value === opts.viewerPubkey);

  if (event.kind === 1 && mentioned) {
    return renderMention(store, event, opts);
  }

  if (event.kind === 6) {
    return renderReblog(store, event, opts);
  }

  if (event.kind === 7 && event.content === '+') {
    return renderFavourite(store, event, opts);
  }

  if (event.kind === 7) {
    return renderReaction(store, event, opts);
  }

  if (event.kind === 30360 && event.pubkey === await Conf.signer.getPublicKey()) {
    return renderNameGrant(event);
  }

  if (event.kind === 9735) {
    return renderZap(store, event, opts);
  }
}

async function renderMention(store: NStore, event: DittoEvent, opts: RenderNotificationOpts) {
  const status = await renderStatus(store, event, opts);
  if (!status) return;

  return {
    id: notificationId(event),
    type: 'mention' as const,
    created_at: nostrDate(event.created_at).toISOString(),
    account: status.account,
    status: status,
  };
}

async function renderReblog(store: NStore, event: DittoEvent, opts: RenderNotificationOpts) {
  if (event.repost?.kind !== 1) return;
  const status = await renderStatus(store, event.repost, opts);
  if (!status) return;
  const account = event.author ? await renderAccount(event.author) : await accountFromPubkey(event.pubkey);

  return {
    id: notificationId(event),
    type: 'reblog' as const,
    created_at: nostrDate(event.created_at).toISOString(),
    account,
    status,
  };
}

async function renderFavourite(store: NStore, event: DittoEvent, opts: RenderNotificationOpts) {
  if (event.reacted?.kind !== 1) return;
  const status = await renderStatus(store, event.reacted, opts);
  if (!status) return;
  const account = event.author ? await renderAccount(event.author) : await accountFromPubkey(event.pubkey);

  return {
    id: notificationId(event),
    type: 'favourite' as const,
    created_at: nostrDate(event.created_at).toISOString(),
    account,
    status,
  };
}

async function renderReaction(store: NStore, event: DittoEvent, opts: RenderNotificationOpts) {
  if (event.reacted?.kind !== 1) return;
  const status = await renderStatus(store, event.reacted, opts);
  if (!status) return;
  const account = event.author ? await renderAccount(event.author) : await accountFromPubkey(event.pubkey);

  return {
    id: notificationId(event),
    type: 'pleroma:emoji_reaction' as const,
    emoji: event.content,
    emoji_url: event.tags.find(([name, value]) => name === 'emoji' && `:${value}:` === event.content)?.[2],
    created_at: nostrDate(event.created_at).toISOString(),
    account,
    status,
  };
}

function renderNameGrant(event: DittoEvent) {
  const r = event.tags.find(([name]) => name === 'r')?.[1];
  const d = event.tags.find(([name]) => name === 'd')?.[1];
  const name = r ?? d;

  if (!name) return;

  const account = event.author ? renderAccount(event.author) : accountFromPubkey(event.pubkey);

  return {
    id: notificationId(event),
    type: 'ditto:name_grant' as const,
    name,
    created_at: nostrDate(event.created_at).toISOString(),
    account,
  };
}

async function renderZap(store: NStore, event: DittoEvent, opts: RenderNotificationOpts) {
  if (!event.zap_sender) return;

  const { zap_amount = 0, zap_message = '' } = event;
  if (zap_amount < 1) return;

  const account = typeof event.zap_sender !== 'string'
    ? await renderAccount(event.zap_sender)
    : await accountFromPubkey(event.zap_sender);

  return {
    id: notificationId(event),
    type: 'ditto:zap' as const,
    amount: zap_amount,
    message: zap_message,
    created_at: nostrDate(event.created_at).toISOString(),
    account,
    ...(event.zapped ? { status: await renderStatus(store, event.zapped, opts) } : {}),
  };
}

/** This helps notifications be sorted in the correct order. */
function notificationId({ id, created_at }: NostrEvent): string {
  return `${created_at}-${id}`;
}

export { renderNotification };
