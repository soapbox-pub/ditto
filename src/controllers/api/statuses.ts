import { type AppController } from '@/app.ts';
import { getAncestors, getDescendants, getEvent, publish } from '@/client.ts';
import { Kind, z } from '@/deps.ts';
import { type Event } from '@/event.ts';
import { signEvent } from '@/sign.ts';
import { toStatus } from '@/transmute.ts';
import { parseBody } from '@/utils.ts';

const createStatusSchema = z.object({
  in_reply_to_id: z.string().optional().catch(undefined),
  language: z.string().optional().catch(undefined),
  media_ids: z.array(z.string()).optional().catch(undefined),
  scheduled_at: z.string().datetime().optional().catch(undefined),
  sensitive: z.boolean().catch(false),
  spoiler_text: z.string().optional().catch(undefined),
  status: z.string(),
  visibility: z.enum(['public', 'unlisted', 'private', 'direct']).optional().catch(undefined),
});

const statusController: AppController = async (c) => {
  const id = c.req.param('id');

  const event = await getEvent(id, 1);
  if (event) {
    return c.json(await toStatus(event as Event<1>));
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

    const event = await signEvent({
      kind: Kind.Text,
      content: data.status,
      tags: [],
      created_at: Math.floor(new Date().getTime() / 1000),
    }, c);

    publish(event);

    return c.json(await toStatus(event));
  } else {
    return c.json({ error: 'Bad request' }, 400);
  }
};

const contextController: AppController = async (c) => {
  const id = c.req.param('id');

  const event = await getEvent(id, 1);

  if (event) {
    const ancestorEvents = await getAncestors(event);
    const descendantEvents = await getDescendants(event.id);

    return c.json({
      ancestors: (await Promise.all((ancestorEvents).map(toStatus))).filter(Boolean),
      descendants: (await Promise.all((descendantEvents).map(toStatus))).filter(Boolean),
    });
  }

  return c.json({ error: 'Event not found.' }, 404);
};

const favouriteController: AppController = async (c) => {
  const id = c.req.param('id');
  const target = await getEvent(id, 1);

  if (target) {
    const event = await signEvent({
      kind: Kind.Reaction,
      content: '+',
      tags: [
        ['e', target.id],
        ['p', target.pubkey],
      ],
      created_at: Math.floor(new Date().getTime() / 1000),
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
