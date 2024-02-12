import { Conf } from '@/config.ts';
import { Debug, type NostrFilter } from '@/deps.ts';
import * as pipeline from '@/pipeline.ts';
import { AdminSigner } from '@/signers/AdminSigner.ts';
import { eventsDB } from '@/storages.ts';

const debug = Debug('ditto:users');

interface User {
  pubkey: string;
  username: string;
  inserted_at: Date;
  admin: boolean;
}

function buildUserEvent(user: User) {
  const { origin, host } = Conf.url;
  const signer = new AdminSigner();

  return signer.signEvent({
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
    created_at: Math.floor(user.inserted_at.getTime() / 1000),
  });
}

/** Adds a user to the database. */
async function insertUser(user: User) {
  debug('insertUser', JSON.stringify(user));
  if (await findUser({ username: user.username })) {
    throw new Error('User already exists');
  }
  const event = await buildUserEvent(user);
  return pipeline.handleEvent(event, AbortSignal.timeout(1000));
}

/**
 * Finds a single user based on one or more properties.
 *
 * ```ts
 * await findUser({ username: 'alex' });
 * ```
 */
async function findUser(user: Partial<User>, signal?: AbortSignal): Promise<User | undefined> {
  const filter: NostrFilter = { kinds: [30361], authors: [Conf.pubkey], limit: 1 };

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

  const [event] = await eventsDB.query([filter], { signal });

  if (event) {
    return {
      pubkey: event.tags.find(([name]) => name === 'd')?.[1]!,
      username: event.tags.find(([name]) => name === 'name')?.[1]!,
      inserted_at: new Date(event.created_at * 1000),
      admin: event.tags.find(([name]) => name === 'role')?.[1] === 'admin',
    };
  }
}

export { buildUserEvent, findUser, insertUser, type User };
