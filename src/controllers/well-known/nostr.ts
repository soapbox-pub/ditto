import { AppController } from '@/app.ts';
import { Conf } from '@/config.ts';
import { z } from '@/deps.ts';
import { eventsDB } from '@/storages.ts';

const nameSchema = z.string().min(1).regex(/^\w+$/);

/**
 * Serves NIP-05's nostr.json.
 * https://github.com/nostr-protocol/nips/blob/master/05.md
 */
const nostrController: AppController = async (c) => {
  const result = nameSchema.safeParse(c.req.query('name'));
  const name = result.success ? result.data : undefined;

  if (!name) {
    return c.json({ names: {}, relays: {} });
  }

  const [label] = await eventsDB.query([{
    kinds: [1985],
    authors: [Conf.pubkey],
    '#L': ['nip05'],
    '#l': [`${name}@${Conf.url.host}`],
  }]);

  const pubkey = label?.tags.find(([name]) => name === 'p')?.[1];

  if (!label || !pubkey) {
    return c.json({ names: {}, relays: {} });
  }

  return c.json({
    names: {
      [name]: pubkey,
    },
    relays: {
      [pubkey]: [Conf.relay],
    },
  });
};

export { nostrController };
