import userBlack from '~/fixtures/events/kind-0-black.json' with { type: 'json' };
import userMe from '~/fixtures/events/event-0-makes-repost-with-quote-repost.json' with { type: 'json' };
import blockEvent from '~/fixtures/events/kind-10000-black-blocks-user-me.json' with { type: 'json' };
import event1authorUserMe from '~/fixtures/events/event-1-quote-repost-will-be-reposted.json' with { type: 'json' };
import { NCache } from 'jsr:@nostrify/nostrify';
import { UserStore } from '@/storages/UserStore.ts';
import { assertEquals } from '@/deps-test.ts';

Deno.test('query events of users that are not blocked', async () => {
  const userBlackCopy = structuredClone(userBlack);
  const userMeCopy = structuredClone(userMe);
  const blockEventCopy = structuredClone(blockEvent);
  const event1authorUserMeCopy = structuredClone(event1authorUserMe);

  const db = new NCache({ max: 100 });

  const store = new UserStore(userBlackCopy.pubkey, db);

  await store.event(blockEventCopy);
  await store.event(userBlackCopy);
  await store.event(userMeCopy);
  await store.event(event1authorUserMeCopy);

  assertEquals(await store.query([{ kinds: [1] }], { limit: 1 }), []);
});
