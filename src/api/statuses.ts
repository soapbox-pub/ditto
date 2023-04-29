import { type AppContext, AppController } from '@/app.ts';
import { validator, z } from '@/deps.ts';
import { type Event } from '@/event.ts';
import { getEvent } from '../client.ts';

import publish from '../publisher.ts';
import { toStatus } from '../transmute.ts';

const createStatusSchema = z.object({
  status: z.string(),
});

const statusController: AppController = async (c) => {
  const id = c.req.param('id');

  const event = await getEvent(id);

  if (event && event.kind === 1) {
    return c.json(await toStatus(event as Event<1>));
  }

  return c.json({ error: 'Event not found.' }, 404);
};

const createStatusController = validator('json', async (value, c: AppContext) => {
  const pubkey = c.get('pubkey')!;
  const seckey = c.get('seckey');
  const result = createStatusSchema.safeParse(value);

  if (result.success && seckey) {
    const { data } = result;

    const event: Event<1> = {
      kind: 1,
      pubkey: pubkey,
      content: data.status,
      tags: [],
      created_at: Math.floor(new Date().getTime() / 1000),
    };

    publish(event, seckey);

    return c.json(await toStatus(event));
  } else {
    return c.json({ error: 'Bad request' }, 400);
  }
});

export { createStatusController, statusController };
