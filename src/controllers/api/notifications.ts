import { type AppController } from '@/app.ts';
import * as mixer from '@/mixer.ts';
import { paginated, paginationSchema } from '@/utils/web.ts';
import { renderNotification } from '@/views/mastodon/notifications.ts';

const notificationsController: AppController = async (c) => {
  const pubkey = c.get('pubkey')!;
  const { since, until } = paginationSchema.parse(c.req.query());

  const events = await mixer.getFilters(
    [{ kinds: [1], '#p': [pubkey], since, until }],
    { signal: AbortSignal.timeout(3000) },
  );

  const statuses = await Promise.all(events.map((event) => renderNotification(event, pubkey)));
  return paginated(c, events, statuses);
};

export { notificationsController };
