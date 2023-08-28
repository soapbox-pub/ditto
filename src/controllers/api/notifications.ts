import { type AppController } from '@/app.ts';
import * as mixer from '@/mixer.ts';
import { buildLinkHeader, paginationSchema } from '@/utils/web.ts';
import { toNotification } from '@/transformers/nostr-to-mastoapi.ts';
import { Time } from '@/utils.ts';

const notificationsController: AppController = async (c) => {
  const pubkey = c.get('pubkey')!;
  const { since, until } = paginationSchema.parse(c.req.query());

  const events = await mixer.getFilters(
    [{ kinds: [1], '#p': [pubkey], since, until }],
    { timeout: Time.seconds(3) },
  );

  const statuses = await Promise.all(events.map(toNotification));

  const link = buildLinkHeader(c.req.url, events);
  return c.json(statuses, 200, link ? { link } : undefined);
};

export { notificationsController };
