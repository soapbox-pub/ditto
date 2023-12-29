import { Conf } from '@/config.ts';
import { db } from '@/db.ts';
import { eventsDB } from '@/db/events.ts';
import { signAdminEvent } from '@/sign.ts';

switch (Deno.args[0]) {
  case 'users-to-events':
    await usersToEvents();
    break;
  default:
    console.log('Usage: deno run -A scripts/db.ts <command>');
}

async function usersToEvents() {
  const { origin, host } = Conf.url;

  for (const row of await db.selectFrom('users').selectAll().execute()) {
    const event = await signAdminEvent({
      kind: 30361,
      tags: [
        ['d', row.pubkey],
        ['name', row.username],
        ['role', row.admin ? 'admin' : 'user'],
        ['origin', origin],
        // NIP-31: https://github.com/nostr-protocol/nips/blob/master/31.md
        ['alt', `@${row.username}@${host}'s account was updated by the admins of ${host}`],
      ],
      content: '',
      created_at: Math.floor(new Date(row.inserted_at).getTime() / 1000),
    });

    await eventsDB.storeEvent(event);
  }
}
