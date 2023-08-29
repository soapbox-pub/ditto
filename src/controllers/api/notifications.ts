import { type AppController } from '@/app.ts';
import * as mixer from '@/mixer.ts';
import { paginated, paginationSchema } from '@/utils/web.ts';
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
  return paginated(c, events, statuses);
};

export { notificationsController };
