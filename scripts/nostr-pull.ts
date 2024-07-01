/**
 * Script to import a user/list of users into Ditto given their npub/pubkey by looking them up on a list of relays.
 */

import { NostrEvent, NRelay1, NSchema } from '@nostrify/nostrify';
import { nip19 } from 'nostr-tools';

import { DittoDB } from '@/db/DittoDB.ts';
import { EventsDB } from '@/storages/EventsDB.ts';

const kysely = await DittoDB.getInstance();
const eventsDB = new EventsDB(kysely);

interface ImportEventsOpts {
  profilesOnly: boolean;
}

type DoEvent = (event: NostrEvent) => void | Promise<void>;
const importUsers = async (
  authors: string[],
  relays: string[],
  opts?: Partial<ImportEventsOpts>,
  doEvent: DoEvent = async (event: NostrEvent) => await eventsDB.event(event),
) => {
  // Kind 0s + follow lists.
  const profiles: Record<string, Record<number, NostrEvent>> = {};
  // Kind 1s.
  const notes = new Set<string>();

  const { profilesOnly = false } = opts || {};

  await Promise.all(relays.map(async (relay) => {
    if (!relay.startsWith('wss://')) console.error(`Invalid relay url ${relay}`);
    const conn = new NRelay1(relay);

    const matched = [
      ...await conn.query([{ kinds: [0, 3], authors, limit: 1000 }]),
      ...(!profilesOnly ? [] : await conn.query(
        authors.map((author) => ({ kinds: [1], authors: [author], limit: 200 })),
      )),
    ];

    await conn.close();
    await Promise.all(
      matched.map(async (event) => {
        const { kind, pubkey } = event;
        if (kind === 1 && !notes.has(event.id)) {
          // add the event to eventsDB only if it has not been found already.
          notes.add(event.id);
          await doEvent(event);
          return;
        }

        profiles[pubkey] ??= {};
        const existing = profiles[pubkey][kind];
        if (existing?.created_at > event.created_at) return;
        else profiles[pubkey][kind] = event;
      }),
    );
  }));

  for (const user in profiles) {
    const profile = profiles[user];
    for (const kind in profile) {
      await doEvent(profile[kind]);
    }
  }
};

if (import.meta.main) {
  if (!Deno.args.length) {
    showHelp();
    Deno.exit(1);
  }
  const pubkeys: string[] = [];
  const relays: string[] = [];

  const opts: Partial<ImportEventsOpts> = {};

  let optionsEnd = false;
  let relaySectionBegun = false;
  for (const arg of Deno.args) {
    if (arg.startsWith('-')) {
      if (optionsEnd) {
        console.error('Option encountered after end of options section.');
        showUsage();
      }
      switch (arg) {
        case '-p':
        case '--profile-only':
          console.info('Only importing profiles.');
          opts.profilesOnly = true;
          break;
      }
    } else if (arg.startsWith('npub1')) {
      optionsEnd = true;

      if (relaySectionBegun) {
        console.error('npub specified in relay section');
        Deno.exit(1);
      }
      const decoded = nip19.decode(arg as `npub1${string}`).data;
      if (!NSchema.id().safeParse(decoded).success) {
        console.error(`invalid pubkey ${arg}, skipping...`);
        continue;
      }
      pubkeys.push(decoded);
    } else if (NSchema.id().safeParse(arg).success) {
      pubkeys.push(arg);
    } else {
      relaySectionBegun = true;
      if (!arg.startsWith('wss://')) {
        console.error(`invalid relay url ${arg}, skipping...`);
      }
      relays.push(arg);
    }
  }

  await importUsers(pubkeys, relays, opts);
  Deno.exit(0);
}

function showHelp() {
  console.info('ditto - db:import');
  console.info("Import users' posts and kind 0s from a given set of relays.\n");
  showUsage();
  console.info(`
OPTIONS:

-p, --profile-only
  Only import profiles and not posts. Default: off.
`);
}

function showUsage() {
  console.info(
    'Usage: deno task db:import [options] npub1xxxxxx[ npub1yyyyyyy]...' +
      ' wss://first.relay[ second.relay]...',
  );
}
