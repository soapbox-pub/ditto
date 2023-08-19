import { EventTemplate, HTTPException } from '@/deps.ts';
import * as pipeline from '@/pipeline.ts';
import { signEvent } from '@/sign.ts';
import { nostrNow } from '@/utils.ts';

import type { AppContext } from '@/app.ts';

/** Publish an event through the API, throwing a Hono exception on failure. */
async function createEvent<K extends number>(t: Omit<EventTemplate<K>, 'created_at'>, c: AppContext) {
  const pubkey = c.get('pubkey');

  if (!pubkey) {
    throw new HTTPException(401);
  }

  const event = await signEvent({
    created_at: nostrNow(),
    ...t,
  }, c);

  try {
    await pipeline.handleEvent(event);
  } catch (e) {
    if (e instanceof pipeline.RelayError) {
      throw new HTTPException(422, {
        res: c.json({ error: e.message }, 422),
      });
    }
  }

  return event;
}

export { createEvent };
