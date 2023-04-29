import { type Event } from '@/event.ts';

import { parseRelay } from './schema.ts';

/** Gets relays which pertain to the author from the event. */
function getAuthorRelays(event: Event): URL[] {
  const relays: string[] = [];

  switch (event.kind) {
    case 10002:
      event.tags.forEach((tag) => tag[0] === 'r' && relays.push(tag[1]));
      break;
    case 2:
      relays.push(event.content);
      break;
  }

  return relays.map(parseRelay).filter((r): r is URL => !!r);
}

export { getAuthorRelays };
