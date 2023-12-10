import { type AppController } from '@/app.ts';
import { getUnattachedMediaByIds } from '@/db/unattached-media.ts';
import { type Event, ISO6391, z } from '@/deps.ts';
import { getAncestors, getAuthor, getDescendants, getEvent } from '@/queries.ts';
import { createEvent, paginationSchema, parseBody } from '@/utils/web.ts';
import { renderEventAccounts } from '@/views.ts';
import { renderStatus } from '@/views/mastodon/statuses.ts';

const createStatusSchema = z.object({
  in_reply_to_id: z.string().regex(/[0-9a-f]{64}/).nullish(),
  language: z.string().refine(ISO6391.validate).nullish(),
  media_ids: z.string().array().nullish(),
  poll: z.object({
    options: z.string().array(),
    expires_in: z.number(),
    multiple: z.boolean().default(false),
    hide_totals: z.boolean().default(false),
  }).nullish(),
  scheduled_at: z.string().datetime().nullish(),
  sensitive: z.boolean().nullish(),
  spoiler_text: z.string().nullish(),
  status: z.string().nullish(),
  visibility: z.enum(['public', 'unlisted', 'private', 'direct']).nullish(),
}).refine(
  (data) => Boolean(data.status || data.media_ids?.length),
  { message: 'Status must contain text or media.' },
);

const statusController: AppController = async (c) => {
  const id = c.req.param('id');

  const event = await getEvent(id, { kind: 1, relations: ['author', 'event_stats', 'author_stats'] });
  if (event) {
    return c.json(await renderStatus(event, c.get('pubkey')));
  }

  return c.json({ error: 'Event not found.' }, 404);
};

const createStatusController: AppController = async (c) => {
  const body = await parseBody(c.req.raw);
  const result = createStatusSchema.safeParse(body);

  if (!result.success) {
    return c.json({ error: 'Bad request', schema: result.error }, 400);
  }

  const { data } = result;

  if (data.visibility !== 'public') {
    return c.json({ error: 'Only posting publicly is supported.' }, 422);
  }

  if (data.poll) {
    return c.json({ error: 'Polls are not yet supported.' }, 422);
  }

  const tags: string[][] = [];

  if (data.in_reply_to_id) {
    tags.push(['e', data.in_reply_to_id, 'reply']);
  }

  if (data.sensitive && data.spoiler_text) {
    tags.push(['content-warning', data.spoiler_text]);
  } else if (data.sensitive) {
    tags.push(['content-warning']);
  } else if (data.spoiler_text) {
    tags.push(['subject', data.spoiler_text]);
  }

  if (data.media_ids?.length) {
    const media = await getUnattachedMediaByIds(data.media_ids)
      .then((media) => media.filter(({ pubkey }) => pubkey === c.get('pubkey')))
      .then((media) => media.map(({ url, data }) => ['media', url, data]));

    tags.push(...media);
  }

  const event = await createEvent({
    kind: 1,
    content: data.status ?? '',
    tags,
  }, c);

  const author = await getAuthor(event.pubkey);
  return c.json(await renderStatus({ ...event, author }, c.get('pubkey')));
};

const contextController: AppController = async (c) => {
  const id = c.req.param('id');
  const event = await getEvent(id, { kind: 1, relations: ['author', 'event_stats', 'author_stats'] });

  async function renderStatuses(events: Event<1>[]) {
    const statuses = await Promise.all(events.map((event) => renderStatus(event, c.get('pubkey'))));
    return statuses.filter(Boolean);
  }

  if (event) {
    const [ancestors, descendants] = await Promise.all([
      getAncestors(event).then(renderStatuses),
      getDescendants(event.id).then(renderStatuses),
    ]);

    return c.json({ ancestors, descendants });
  }

  return c.json({ error: 'Event not found.' }, 404);
};

const favouriteController: AppController = async (c) => {
  const id = c.req.param('id');
  const target = await getEvent(id, { kind: 1, relations: ['author', 'event_stats', 'author_stats'] });

  if (target) {
    await createEvent({
      kind: 7,
      content: '+',
      tags: [
        ['e', target.id],
        ['p', target.pubkey],
      ],
    }, c);

    const status = await renderStatus(target, c.get('pubkey'));

    if (status) {
      status.favourited = true;
      status.favourites_count++;
    }

    return c.json(status);
  } else {
    return c.json({ error: 'Event not found.' }, 404);
  }
};

const favouritedByController: AppController = (c) => {
  const id = c.req.param('id');
  const params = paginationSchema.parse(c.req.query());
  return renderEventAccounts(c, [{ kinds: [7], '#e': [id], ...params }]);
};

const rebloggedByController: AppController = (c) => {
  const id = c.req.param('id');
  const params = paginationSchema.parse(c.req.query());
  return renderEventAccounts(c, [{ kinds: [6], '#e': [id], ...params }]);
};

export {
  contextController,
  createStatusController,
  favouriteController,
  favouritedByController,
  rebloggedByController,
  statusController,
};
