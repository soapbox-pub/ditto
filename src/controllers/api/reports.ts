import { type AppController } from '@/app.ts';
import { z } from 'zod';
import { createEvent, parseBody } from '@/utils/api.ts';
import { Conf } from '@/config.ts';
import { hydrateEvents } from '@/storages/hydrate.ts';
import { renderReports } from '@/views/mastodon/reports.ts';

const reportsSchema = z.object({
  account_id: z.string(),
  status_ids: z.string().array().default([]),
  comment: z.string().max(1000).default(''),
  forward: z.boolean().default(false),
  category: z.string().default('other'),
  // TODO: rules_ids[] is not implemented
});

/** https://docs.joinmastodon.org/methods/reports/ */
const reportsController: AppController = async (c) => {
  const store = c.get('store');
  const body = await parseBody(c.req.raw);
  const result = reportsSchema.safeParse(body);

  if (!result.success) {
    return c.json(result.error, 422);
  }

  const {
    account_id,
    status_ids,
    comment,
    forward,
    category,
  } = result.data;

  const [personBeingReported] = await store.query([{ kinds: [0], authors: [account_id] }]);
  if (!personBeingReported) {
    return c.json({ error: 'Record not found' }, 404);
  }

  await hydrateEvents({ events: [personBeingReported], storage: store });

  const event = await createEvent({
    kind: 1984,
    content: JSON.stringify({ account_id, status_ids, comment, forward, category }),
    tags: [
      ['p', account_id, category],
      ['P', Conf.pubkey],
    ],
  }, c);

  return c.json(await renderReports(event, personBeingReported, {}));
};

export { reportsController };
