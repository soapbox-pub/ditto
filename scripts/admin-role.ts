import { NSchema } from '@nostrify/nostrify';

import { DittoDB } from '@/db/DittoDB.ts';
import { AdminSigner } from '@/signers/AdminSigner.ts';
import { EventsDB } from '@/storages/EventsDB.ts';
import { nostrNow } from '@/utils.ts';

const kysely = await DittoDB.getInstance();
const eventsDB = new EventsDB(kysely);

const [pubkey, role] = Deno.args;

if (!NSchema.id().safeParse(pubkey).success) {
  console.error('Invalid pubkey');
  Deno.exit(1);
}

if (!['admin', 'user'].includes(role)) {
  console.error('Invalid role');
  Deno.exit(1);
}

const signer = new AdminSigner();
const admin = await signer.getPublicKey();

const [existing] = await eventsDB.query([{
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

await eventsDB.event(event);

Deno.exit(0);
