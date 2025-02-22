import { MockRelay } from '@nostrify/nostrify/test';

import { assertEquals } from '@std/assert';

import { MuteListPolicy } from './MuteListPolicy.ts';

import userBlack from '~/fixtures/events/kind-0-black.json' with { type: 'json' };
import userMe from '~/fixtures/events/event-0-makes-repost-with-quote-repost.json' with { type: 'json' };
import blockEvent from '~/fixtures/events/kind-10000-black-blocks-user-me.json' with { type: 'json' };
import event1authorUserMe from '~/fixtures/events/event-1-quote-repost-will-be-reposted.json' with { type: 'json' };
import event1 from '~/fixtures/events/event-1.json' with { type: 'json' };

Deno.test('block event: muted user cannot post', async () => {
  const userBlackCopy = structuredClone(userBlack);
  const userMeCopy = structuredClone(userMe);
  const blockEventCopy = structuredClone(blockEvent);
  const event1authorUserMeCopy = structuredClone(event1authorUserMe);

  const relay = new MockRelay();
  const policy = new MuteListPolicy(userBlack.pubkey, relay);

  await relay.event(blockEventCopy);
  await relay.event(userBlackCopy);
  await relay.event(userMeCopy);

  const ok = await policy.call(event1authorUserMeCopy);

  assertEquals(ok, ['OK', event1authorUserMeCopy.id, false, 'blocked: account blocked']);
});

Deno.test('allow event: user is NOT muted because there is no muted event', async () => {
  const userBlackCopy = structuredClone(userBlack);
  const userMeCopy = structuredClone(userMe);
  const event1authorUserMeCopy = structuredClone(event1authorUserMe);

  const relay = new MockRelay();
  const policy = new MuteListPolicy(userBlack.pubkey, relay);

  await relay.event(userBlackCopy);
  await relay.event(userMeCopy);

  const ok = await policy.call(event1authorUserMeCopy);

  assertEquals(ok, ['OK', event1authorUserMeCopy.id, true, '']);
});

Deno.test('allow event: user is NOT muted because he is not in mute event', async () => {
  const userBlackCopy = structuredClone(userBlack);
  const userMeCopy = structuredClone(userMe);
  const event1authorUserMeCopy = structuredClone(event1authorUserMe);
  const blockEventCopy = structuredClone(blockEvent);
  const event1copy = structuredClone(event1);

  const relay = new MockRelay();

  const policy = new MuteListPolicy(userBlack.pubkey, relay);

  await relay.event(userBlackCopy);
  await relay.event(blockEventCopy);
  await relay.event(userMeCopy);
  await relay.event(event1copy);
  await relay.event(event1authorUserMeCopy);

  const ok = await policy.call(event1copy);

  assertEquals(ok, ['OK', event1.id, true, '']);
});
