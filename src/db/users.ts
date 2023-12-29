import { Conf } from '@/config.ts';
import { Debug, type Filter, type Insertable } from '@/deps.ts';
import { type UserRow } from '@/db.ts';
import { eventsDB } from '@/db/events.ts';
import * as pipeline from '@/pipeline.ts';
import { signAdminEvent } from '@/sign.ts';
import { nostrNow } from '@/utils.ts';

const debug = Debug('ditto:users');

interface User {
  pubkey: string;
  username: string;
  inserted_at: Date;
  admin: boolean;
}

/** Adds a user to the database. */
async function insertUser(user: Insertable<UserRow>) {
  debug('insertUser', JSON.stringify(user));
  const { origin, host } = Conf.url;

  const event = await signAdminEvent({
    kind: 30361,
    tags: [
      ['d', user.pubkey],
      ['name', user.username],
      ['role', user.admin ? 'admin' : 'user'],
      ['origin', origin],
      // NIP-31: https://github.com/nostr-protocol/nips/blob/master/31.md
      ['alt', `@${user.username}@${host}'s account was updated by the admins of ${host}`],
    ],
    content: '',
    created_at: nostrNow(),
  });

  return pipeline.handleEvent(event);
}

/**
 * Finds a single user based on one or more properties.
 *
 * ```ts
 * await findUser({ username: 'alex' });
 * ```
 */
async function findUser(user: Partial<Insertable<UserRow>>): Promise<User | undefined> {
  const filter: Filter = { kinds: [30361], authors: [Conf.pubkey], limit: 1 };

  for (const [key, value] of Object.entries(user)) {
    switch (key) {
      case 'pubkey':
        filter['#d'] = [String(value)];
        break;
      case 'username':
        filter['#name'] = [String(value)];
        break;
      case 'admin':
        filter['#role'] = [value ? 'admin' : 'user'];
        break;
    }
  }

  const [event] = await eventsDB.getEvents([filter]);

  if (event) {
    return {
      pubkey: event.tags.find(([name]) => name === 'd')?.[1]!,
      username: event.tags.find(([name]) => name === 'name')?.[1]!,
      inserted_at: new Date(event.created_at * 1000),
      admin: event.tags.find(([name]) => name === 'role')?.[1] === 'admin',
    };
  }
}

export { findUser, insertUser, type User };
