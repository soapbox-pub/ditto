import { MockRelay } from '@nostrify/nostrify/test';
import { assertEquals } from '@std/assert';

import { UserStore } from './UserStore.ts';

import userBlack from '~/fixtures/events/kind-0-black.json' with { type: 'json' };
import userMe from '~/fixtures/events/event-0-makes-repost-with-quote-repost.json' with { type: 'json' };
import blockEvent from '~/fixtures/events/kind-10000-black-blocks-user-me.json' with { type: 'json' };
import event1authorUserMe from '~/fixtures/events/event-1-quote-repost-will-be-reposted.json' with { type: 'json' };

Deno.test('query events of users that are not muted', async () => {
  const userBlackCopy = structuredClone(userBlack);
  const userMeCopy = structuredClone(userMe);
  const blockEventCopy = structuredClone(blockEvent);
  const event1authorUserMeCopy = structuredClone(event1authorUserMe);

  const relay = new MockRelay();
  const store = new UserStore({ relay, userPubkey: userBlackCopy.pubkey });

  await store.event(blockEventCopy);
  await store.event(userBlackCopy);
  await store.event(userMeCopy);
  await store.event(event1authorUserMeCopy);

  assertEquals(await store.query([{ kinds: [1] }], { limit: 1 }), []);
});

Deno.test('user never muted anyone', async () => {
  const userBlackCopy = structuredClone(userBlack);
  const userMeCopy = structuredClone(userMe);

  const relay = new MockRelay();
  const store = new UserStore({ relay, userPubkey: userBlackCopy.pubkey });

  await store.event(userBlackCopy);
  await store.event(userMeCopy);

  assertEquals(await store.query([{ kinds: [0], authors: [userMeCopy.pubkey] }], { limit: 1 }), [userMeCopy]);
});
