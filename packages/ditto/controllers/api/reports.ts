import { NostrFilter, NSchema as n } from '@nostrify/nostrify';
import { z } from 'zod';

import { type AppController } from '@/app.ts';
import { createEvent, paginated, parseBody, updateEventInfo } from '@/utils/api.ts';
import { hydrateEvents } from '@/storages/hydrate.ts';
import { renderAdminReport } from '@/views/mastodon/reports.ts';
import { renderReport } from '@/views/mastodon/reports.ts';
import { booleanParamSchema } from '@/schema.ts';

const reportSchema = z.object({
  account_id: n.id(),
  status_ids: n.id().array().default([]),
  comment: z.string().max(1000).default(''),
  category: z.string().default('other'),
  // TODO: rules_ids[] is not implemented
});

/** https://docs.joinmastodon.org/methods/reports/#post */
const reportController: AppController = async (c) => {
  const { conf } = c.var;
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

  const tags = [
    ['p', account_id, category],
    ['P', await conf.signer.getPublicKey()],
  ];

  for (const status of status_ids) {
    tags.push(['e', status, category]);
  }

  const event = await createEvent({
    kind: 1984,
    content: comment,
    tags,
  }, c);

  await hydrateEvents({ events: [event], store });
  return c.json(await renderReport(event));
};

const adminReportsSchema = z.object({
  resolved: booleanParamSchema.optional(),
  account_id: n.id().optional(),
  target_account_id: n.id().optional(),
});

/** https://docs.joinmastodon.org/methods/admin/reports/#get */
const adminReportsController: AppController = async (c) => {
  const { conf } = c.var;
  const store = c.get('store');
  const viewerPubkey = await c.get('signer')?.getPublicKey();

  const params = c.get('pagination');
  const { resolved, account_id, target_account_id } = adminReportsSchema.parse(c.req.query());

  const filter: NostrFilter = {
    kinds: [30383],
    authors: [await conf.signer.getPublicKey()],
    '#k': ['1984'],
    ...params,
  };

  if (typeof resolved === 'boolean') {
    filter['#n'] = [resolved ? 'closed' : 'open'];
  }
  if (account_id) {
    filter['#p'] = [account_id];
  }
  if (target_account_id) {
    filter['#P'] = [target_account_id];
  }

  const orig = await store.query([filter]);
  const ids = new Set<string>();

  for (const event of orig) {
    const d = event.tags.find(([name]) => name === 'd')?.[1];
    if (d) {
      ids.add(d);
    }
  }

  const events = await store.query([{ kinds: [1984], ids: [...ids] }])
    .then((events) => hydrateEvents({ store, events: events, signal: c.req.raw.signal }));

  const reports = await Promise.all(
    events.map((event) => renderAdminReport(event, { viewerPubkey })),
  );

  return paginated(c, orig, reports);
};

/** https://docs.joinmastodon.org/methods/admin/reports/#get-one */
const adminReportController: AppController = async (c) => {
  const eventId = c.req.param('id');
  const { signal } = c.req.raw;
  const store = c.get('store');
  const pubkey = await c.get('signer')?.getPublicKey();

  const [event] = await store.query([{
    kinds: [1984],
    ids: [eventId],
    limit: 1,
  }], { signal });

  if (!event) {
    return c.json({ error: 'Not found' }, 404);
  }

  await hydrateEvents({ events: [event], store, signal });

  const report = await renderAdminReport(event, { viewerPubkey: pubkey });
  return c.json(report);
};

/** https://docs.joinmastodon.org/methods/admin/reports/#resolve */
const adminReportResolveController: AppController = async (c) => {
  const eventId = c.req.param('id');
  const { signal } = c.req.raw;
  const store = c.get('store');
  const pubkey = await c.get('signer')?.getPublicKey();

  const [event] = await store.query([{
    kinds: [1984],
    ids: [eventId],
    limit: 1,
  }], { signal });

  if (!event) {
    return c.json({ error: 'Not found' }, 404);
  }

  await updateEventInfo(eventId, { open: false, closed: true }, c);
  await hydrateEvents({ events: [event], store, signal });

  const report = await renderAdminReport(event, { viewerPubkey: pubkey });
  return c.json(report);
};

const adminReportReopenController: AppController = async (c) => {
  const eventId = c.req.param('id');
  const { signal } = c.req.raw;
  const store = c.get('store');
  const pubkey = await c.get('signer')?.getPublicKey();

  const [event] = await store.query([{
    kinds: [1984],
    ids: [eventId],
    limit: 1,
  }], { signal });

  if (!event) {
    return c.json({ error: 'Not found' }, 404);
  }

  await updateEventInfo(eventId, { open: true, closed: false }, c);
  await hydrateEvents({ events: [event], store, signal });

  const report = await renderAdminReport(event, { viewerPubkey: pubkey });
  return c.json(report);
};

export {
  adminReportController,
  adminReportReopenController,
  adminReportResolveController,
  adminReportsController,
  reportController,
};
