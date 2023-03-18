import { validator, z } from '@/deps.ts';

import publish from '../publisher.ts';
import { toStatus } from '../transmute.ts';
import { getKeys } from '../utils.ts';

import type { Event } from '../event.ts';

const createStatusSchema = z.object({
  status: z.string(),
});

const createStatusController = validator('json', async (value, c) => {
  const keys = getKeys(c);
  const result = createStatusSchema.safeParse(value);

  if (result.success && keys) {
    const { data } = result;
    const { pubkey, privatekey } = keys;

    const event: Event<1> = {
      kind: 1,
      pubkey: pubkey,
      content: data.status,
      tags: [],
      created_at: Math.floor(new Date().getTime() / 1000),
    };

    publish(event, privatekey);

    return c.json(await toStatus(event));
  } else {
    return c.json({ error: 'Bad request' }, 400);
  }
});

export { createStatusController };
