import { type AppController } from '@/app.ts';
import { createEvent, parseBody } from '@/utils/api.ts';
import { Conf } from '@/config.ts';
import { hydrateEvents } from '@/storages/hydrate.ts';
import { NSchema as n } from '@nostrify/nostrify';
import { renderReport } from '@/views/mastodon/reports.ts';
import { z } from 'zod';
import { renderAdminReport } from '@/views/mastodon/reports.ts';

const reportsSchema = z.object({
  account_id: n.id(),
  status_ids: n.id().array().default([]),
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

  const [profile] = await store.query([{ kinds: [0], authors: [account_id] }]);
  if (profile) {
    await hydrateEvents({ events: [profile], storage: store });
  }

  const event = await createEvent({
    kind: 1984,
    content: JSON.stringify({ account_id, status_ids, comment, forward, category }),
    tags: [
      ['p', account_id, category],
      ['P', Conf.pubkey],
    ],
  }, c);

  return c.json(await renderReport(event, profile));
};

/** https://docs.joinmastodon.org/methods/admin/reports/#get */
const viewAllReportsController: AppController = async (c) => {
  const store = c.get('store');
  const allMastodonReports = [];

  const allReports = await store.query([{ kinds: [1984], '#P': [Conf.pubkey] }]);

  await hydrateEvents({ storage: store, events: allReports, signal: AbortSignal.timeout(2000) });

  for (const report of allReports) {
    allMastodonReports.push(await renderAdminReport(report, { viewerPubkey: c.get('pubkey') }));
  }

  return c.json(allMastodonReports);
};

export { reportsController, viewAllReportsController };
