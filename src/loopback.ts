import { Conf } from '@/config.ts';
import { relayInit } from '@/deps.ts';
import { trends } from '@/trends.ts';
import { nostrNow } from '@/utils.ts';

const relay = relayInit(Conf.relay);
await relay.connect();

const sub = relay.sub([{ kinds: [1], since: nostrNow() }]);

sub.on('event', (event) => {
  console.info('loopback event:', event.id);
  const tags = event.tags
    .filter((tag) => tag[0] === 't')
    .map((tag) => tag[1]);

  try {
    trends.addTagUsages(event.pubkey, tags);
  } catch (_e) {
    // do nothing
  }
});
