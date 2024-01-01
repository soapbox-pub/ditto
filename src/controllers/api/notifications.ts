import { type AppController } from '@/app.ts';
import { eventsDB } from '@/db/events.ts';
import { paginated, paginationSchema } from '@/utils/api.ts';
import { renderNotification } from '@/views/mastodon/notifications.ts';

const notificationsController: AppController = async (c) => {
  const pubkey = c.get('pubkey')!;
  const { since, until } = paginationSchema.parse(c.req.query());

  const events = await eventsDB.getEvents(
    [{ kinds: [1], '#p': [pubkey], since, until }],
    { signal: AbortSignal.timeout(3000) },
  );

  const statuses = await Promise.all(events.map((event) => renderNotification(event, pubkey)));
  return paginated(c, events, statuses);
};

export { notificationsController };
