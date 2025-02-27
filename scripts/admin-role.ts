import { DittoConf } from '@ditto/conf';
import { DittoPolyPg } from '@ditto/db';
import { NSchema } from '@nostrify/nostrify';
import { nip19 } from 'nostr-tools';

import { DittoPgStore } from '../packages/ditto/storages/DittoPgStore.ts';
import { nostrNow } from '../packages/ditto/utils.ts';

const conf = new DittoConf(Deno.env);
const db = new DittoPolyPg(conf.databaseUrl);
const relay = new DittoPgStore({ db, conf });

const [pubkeyOrNpub, role] = Deno.args;
const pubkey = pubkeyOrNpub.startsWith('npub1') ? nip19.decode(pubkeyOrNpub as `npub1${string}`).data : pubkeyOrNpub;

const { signer } = conf;

if (!NSchema.id().safeParse(pubkey).success) {
  console.error('Invalid pubkey');
  Deno.exit(1);
}

if (!['admin', 'user'].includes(role)) {
  console.error('Invalid role');
  Deno.exit(1);
}

const admin = await signer.getPublicKey();

const [existing] = await relay.query([{
  kinds: [30382],
  authors: [admin],
  '#d': [pubkey],
  limit: 1,
}]);

const prevTags = (existing?.tags ?? []).filter(([name, value]) => {
  if (name === 'd') {
    return false;
  }
  if (name === 'n' && value === 'admin') {
    return false;
  }
  return true;
});

const tags: string[][] = [
  ['d', pubkey],
];

if (role === 'admin') {
  tags.push(['n', 'admin']);
}

tags.push(...prevTags);

const event = await signer.signEvent({
  kind: 30382,
  tags,
  content: '',
  created_at: nostrNow(),
});

await relay.event(event);

Deno.exit(0);
