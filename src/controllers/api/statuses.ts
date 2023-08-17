import { type AppController } from '@/app.ts';
import { publish } from '@/client.ts';
import { ISO6391, Kind, z } from '@/deps.ts';
import { getAncestors, getDescendants, getEvent } from '@/queries.ts';
import { signEvent } from '@/sign.ts';
import { toStatus } from '@/transformers/nostr-to-mastoapi.ts';
import { nostrNow, parseBody } from '@/utils.ts';

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

  const event = await getEvent(id, { kind: 1 });
  if (event) {
    return c.json(await toStatus(event));
  }

  return c.json({ error: 'Event not found.' }, 404);
};

const createStatusController: AppController = async (c) => {
  const body = await parseBody(c.req.raw);
  const result = createStatusSchema.safeParse(body);

  if (result.success) {
    const { data } = result;

    if (data.visibility !== 'public') {
      return c.json({ error: 'Only posting publicly is supported.' }, 422);
    }

    if (data.poll) {
      return c.json({ error: 'Polls are not yet supported.' }, 422);
    }

    if (data.media_ids?.length) {
      return c.json({ error: 'Media uploads are not yet supported.' }, 422);
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

    const event = await signEvent({
      kind: Kind.Text,
      content: data.status ?? '',
      tags,
      created_at: nostrNow(),
    }, c);

    publish(event);

    return c.json(await toStatus(event));
  } else {
    return c.json({ error: 'Bad request', schema: result.error }, 400);
  }
};

const contextController: AppController = async (c) => {
  const id = c.req.param('id');

  const event = await getEvent(id, { kind: 1 });

  if (event) {
    const ancestorEvents = await getAncestors(event);
    const descendantEvents = await getDescendants(event.id);

    return c.json({
      ancestors: (await Promise.all(ancestorEvents.map(toStatus))).filter(Boolean),
      descendants: (await Promise.all(descendantEvents.map(toStatus))).filter(Boolean),
    });
  }

  return c.json({ error: 'Event not found.' }, 404);
};

const favouriteController: AppController = async (c) => {
  const id = c.req.param('id');
  const target = await getEvent(id, { kind: 1 });

  if (target) {
    const event = await signEvent({
      kind: Kind.Reaction,
      content: '+',
      tags: [
        ['e', target.id],
        ['p', target.pubkey],
      ],
      created_at: nostrNow(),
    }, c);

    publish(event);

    const status = await toStatus(target);

    if (status) {
      status.favourited = true;
      status.favourites_count++;
    }

    return c.json(status);
  } else {
    return c.json({ error: 'Event not found.' }, 404);
  }
};

export { contextController, createStatusController, favouriteController, statusController };
