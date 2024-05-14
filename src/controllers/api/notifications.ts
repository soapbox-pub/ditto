import { NostrFilter } from '@nostrify/nostrify';

import { AppContext, AppController } from '@/app.ts';
import { hydrateEvents } from '@/storages/hydrate.ts';
import { paginated, paginationSchema } from '@/utils/api.ts';
import { renderNotification } from '@/views/mastodon/notifications.ts';

const notificationsController: AppController = async (c) => {
  const pubkey = await c.get('signer')?.getPublicKey()!;
  const { since, until } = paginationSchema.parse(c.req.query());

  return renderNotifications(c, [{ kinds: [1, 6, 7], '#p': [pubkey], since, until }]);
};

async function renderNotifications(c: AppContext, filters: NostrFilter[]) {
  const store = c.get('store');
  const pubkey = await c.get('signer')?.getPublicKey()!;
  const { signal } = c.req.raw;

  const events = await store
    .query(filters, { signal })
    .then((events) => events.filter((event) => event.pubkey !== pubkey))
    .then((events) => hydrateEvents({ events, storage: store, signal }));

  if (!events.length) {
    return c.json([]);
  }

  const notifications = (await Promise
    .all(events.map((event) => renderNotification(event, { viewerPubkey: pubkey }))))
    .filter(Boolean);

  if (!notifications.length) {
    return c.json([]);
  }

  return paginated(c, events, notifications);
}

export { notificationsController };
