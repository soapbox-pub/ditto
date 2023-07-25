import { Conf } from '@/config.ts';
import { relayInit } from '@/deps.ts';
import { trends } from '@/trends.ts';
import { nostrDate, nostrNow } from '@/utils.ts';

import type { Event } from '@/event.ts';

const relay = relayInit(Conf.relay);
await relay.connect();

// This file watches all events on your Ditto relay and triggers
// side-effects based on them. This can be used for things like
// notifications, trending hashtag tracking, etc.
relay
  .sub([{ kinds: [1], since: nostrNow() }])
  .on('event', handleEvent);

/** Handle events through the loopback pipeline. */
function handleEvent(event: Event): void {
  console.info('loopback event:', event.id);
  trackHashtags(event);
}

/** Track whenever a hashtag is used, for processing trending tags. */
function trackHashtags(event: Event): void {
  const date = nostrDate(event.created_at);

  const tags = event.tags
    .filter((tag) => tag[0] === 't')
    .map((tag) => tag[1]);

  try {
    trends.addTagUsages(event.pubkey, tags, date);
  } catch (_e) {
    // do nothing
  }
}
