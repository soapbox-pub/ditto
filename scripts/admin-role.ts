import { NSchema } from '@nostrify/nostrify';

import { db } from '@/db.ts';
import { Conf } from '@/config.ts';
import { AdminSigner } from '@/signers/AdminSigner.ts';
import { EventsDB } from '@/storages/events-db.ts';
import { nostrNow } from '@/utils.ts';

const eventsDB = new EventsDB(db);

const [pubkey, role] = Deno.args;

if (!NSchema.id().safeParse(pubkey).success) {
  console.error('Invalid pubkey');
  Deno.exit(1);
}

if (!['admin', 'user'].includes(role)) {
  console.error('Invalid role');
  Deno.exit(1);
}

const event = await new AdminSigner().signEvent({
  kind: 30361,
  tags: [
    ['d', pubkey],
    ['role', role],
    // NIP-31: https://github.com/nostr-protocol/nips/blob/master/31.md
    ['alt', `User's account was updated by the admins of ${Conf.url.host}`],
  ],
  content: '',
  created_at: nostrNow(),
});

await eventsDB.event(event);

Deno.exit(0);
