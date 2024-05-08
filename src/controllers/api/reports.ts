import { NSchema as n } from '@nostrify/nostrify';
import { z } from 'zod';

import { type AppController } from '@/app.ts';
import { Conf } from '@/config.ts';
import { createAdminEvent, createEvent, parseBody } from '@/utils/api.ts';
import { hydrateEvents } from '@/storages/hydrate.ts';
import { renderAdminReport } from '@/views/mastodon/reports.ts';
import { renderReport } from '@/views/mastodon/reports.ts';

const reportSchema = z.object({
  account_id: n.id(),
  status_ids: n.id().array().default([]),
  comment: z.string().max(1000).default(''),
  category: z.string().default('other'),
  // TODO: rules_ids[] is not implemented
});

/** https://docs.joinmastodon.org/methods/reports/#post */
const reportController: AppController = async (c) => {
  const store = c.get('store');
  const body = await parseBody(c.req.raw);
  const result = reportSchema.safeParse(body);

  if (!result.success) {
    return c.json(result.error, 422);
  }

  const {
    account_id,
    status_ids,
    comment,
    category,
  } = result.data;

  const [profile] = await store.query([{ kinds: [0], authors: [account_id] }]);
  if (profile) {
    await hydrateEvents({ events: [profile], storage: store });
  }

  const tags = [
    ['p', account_id, category],
    ['P', Conf.pubkey],
  ];

  for (const status of status_ids) {
    tags.push(['e', status, category]);
  }

  const event = await createEvent({
    kind: 1984,
    content: comment,
    tags,
  }, c);

  return c.json(await renderReport(event, profile));
};

/** https://docs.joinmastodon.org/methods/admin/reports/#get */
const adminReportsController: AppController = async (c) => {
  const store = c.get('store');
  const reports = await store.query([{ kinds: [1984], '#P': [Conf.pubkey] }])
    .then((events) => hydrateEvents({ storage: store, events: events, signal: c.req.raw.signal }))
    .then((events) => Promise.all(events.map((event) => renderAdminReport(event, { viewerPubkey: c.get('pubkey') }))));

  return c.json(reports);
};

/** https://docs.joinmastodon.org/methods/admin/reports/#get-one */
const adminReportController: AppController = async (c) => {
  const eventId = c.req.param('id');
  const { signal } = c.req.raw;
  const store = c.get('store');
  const pubkey = c.get('pubkey');

  const [event] = await store.query([{
    kinds: [1984],
    ids: [eventId],
    limit: 1,
  }], { signal });

  if (!event) {
    return c.json({ error: 'This action is not allowed' }, 403);
  }

  await hydrateEvents({ events: [event], storage: store, signal });

  return c.json(await renderAdminReport(event, { viewerPubkey: pubkey }));
};

/** https://docs.joinmastodon.org/methods/admin/reports/#resolve */
const adminReportResolveController: AppController = async (c) => {
  const eventId = c.req.param('id');
  const { signal } = c.req.raw;
  const store = c.get('store');
  const pubkey = c.get('pubkey');

  const [event] = await store.query([{
    kinds: [1984],
    ids: [eventId],
    limit: 1,
  }], { signal });

  if (!event) {
    return c.json({ error: 'This action is not allowed' }, 403);
  }

  await hydrateEvents({ events: [event], storage: store, signal });

  await createAdminEvent({
    kind: 5,
    tags: [['e', event.id]],
    content: 'Report closed.',
  }, c);

  return c.json(await renderAdminReport(event, { viewerPubkey: pubkey, action_taken: true }));
};

export { adminReportController, adminReportResolveController, adminReportsController, reportController };
