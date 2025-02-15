import { NostrFilter, NSchema as n } from '@nostrify/nostrify';
import { z } from 'zod';

import { AppContext, AppController } from '@/app.ts';
import { Conf } from '@/config.ts';
import { DittoPagination } from '@/interfaces/DittoPagination.ts';
import { hydrateEvents } from '@/storages/hydrate.ts';
import { paginated } from '@/utils/api.ts';
import { renderNotification } from '@/views/mastodon/notifications.ts';

/** Set of known notification types across backends. */
const notificationTypes = new Set([
  'mention',
  'status',
  'reblog',
  'follow',
  'follow_request',
  'favourite',
  'poll',
  'update',
  'admin.sign_up',
  'admin.report',
  'severed_relationships',
  'pleroma:emoji_reaction',
  'ditto:name_grant',
  'ditto:zap',
]);

const notificationsSchema = z.object({
  account_id: n.id().optional(),
});

const notificationsController: AppController = async (c) => {
  const pubkey = await c.get('signer')?.getPublicKey()!;
  const params = c.get('pagination');

  const types = notificationTypes
    .intersection(new Set(c.req.queries('types[]') ?? notificationTypes))
    .difference(new Set(c.req.queries('exclude_types[]')));

  const { account_id } = notificationsSchema.parse(c.req.query());

  const kinds = new Set<number>();

  if (types.has('mention')) {
    kinds.add(1);
  }
  if (types.has('reblog')) {
    kinds.add(6);
  }
  if (types.has('favourite') || types.has('pleroma:emoji_reaction')) {
    kinds.add(7);
  }
  if (types.has('ditto:zap')) {
    kinds.add(9735);
  }

  const filter: NostrFilter = {
    kinds: [...kinds],
    '#p': [pubkey],
    ...params,
  };

  const filters: NostrFilter[] = [filter];

  if (account_id) {
    filter.authors = [account_id];
  }

  if (types.has('ditto:name_grant') && !account_id) {
    filters.push({ kinds: [30360], authors: [Conf.pubkey], '#p': [pubkey], ...params });
  }

  return renderNotifications(filters, types, params, c);
};

const notificationController: AppController = async (c) => {
  const id = c.req.param('id');
  const pubkey = await c.get('signer')?.getPublicKey()!;
  const store = c.get('store');

  // Remove the timestamp from the ID.
  const eventId = id.replace(/^\d+-/, '');

  const [event] = await store.query([{ ids: [eventId] }]);

  if (!event) {
    return c.json({ error: 'Event not found' }, { status: 404 });
  }

  await hydrateEvents({ events: [event], store });

  const notification = await renderNotification(event, { viewerPubkey: pubkey });

  if (!notification) {
    return c.json({ error: 'Notification not found' }, { status: 404 });
  }

  return c.json(notification);
};

async function renderNotifications(
  filters: NostrFilter[],
  types: Set<string>,
  params: DittoPagination,
  c: AppContext,
) {
  const store = c.get('store');
  const pubkey = await c.get('signer')?.getPublicKey()!;
  const { signal } = c.req.raw;
  const opts = { signal, limit: params.limit, timeout: Conf.db.timeouts.timelines };

  const events = await store
    .query(filters, opts)
    .then((events) => events.filter((event) => event.pubkey !== pubkey))
    .then((events) => hydrateEvents({ events, store, signal }));

  if (!events.length) {
    return c.json([]);
  }

  const notifications = (await Promise.all(events.map((event) => {
    return renderNotification(event, { viewerPubkey: pubkey });
  })))
    .filter((notification) => notification && types.has(notification.type));

  if (!notifications.length) {
    return c.json([]);
  }

  return paginated(c, events, notifications);
}

export { notificationController, notificationsController };
