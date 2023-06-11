import { Conf } from '@/config.ts';
import { finishEvent, nip19 } from '@/deps.ts';

import type { EventTemplate, SignedEvent } from '@/event.ts';

// deno-lint-ignore require-await
async function signAdminEvent<K extends number = number>(event: EventTemplate<K>): Promise<SignedEvent<K>> {
  if (!Conf.nsec) throw new Error('No secret key. Set one with DITTO_NSEC.');

  const result = nip19.decode(Conf.nsec);

  if (result.type !== 'nsec') throw new Error('Invalid DITTO_NSEC. It should start with "nsec1..."');

  return finishEvent(event, result.data);
}

export { signAdminEvent };
