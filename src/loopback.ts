import { Conf } from '@/config.ts';
import { relayInit, Sqlite } from '@/deps.ts';
import { TrendsDB } from '@/trends.ts';

const db = new Sqlite('data/trends.sqlite3');
const trends = new TrendsDB(db);

const relay = relayInit(Conf.relay);
await relay.connect();

const sub = relay.sub([{ kinds: [1] }]);

sub.on('eose', sub.unsub);
sub.on('event', (event) => {
  const tags = event.tags
    .filter((tag) => tag[0] === 't')
    .map((tag) => tag[1]);

  try {
    trends.addTagUsages(event.pubkey, tags);
  } catch (_e) {
    // do nothing
  }
});
