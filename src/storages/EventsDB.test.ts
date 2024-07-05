import { assertEquals, assertRejects } from '@std/assert';
import { generateSecretKey } from 'nostr-tools';

import { Database as Sqlite } from '@db/sqlite';
import { Conf } from '@/config.ts';
import { DittoDB } from '@/db/DittoDB.ts';
import { RelayError } from '@/RelayError.ts';
import { eventFixture, genEvent } from '@/test.ts';
import { EventsDB } from '@/storages/EventsDB.ts';
import { DittoTables } from '@/db/DittoTables.ts';
import { Kysely } from 'kysely';
import { DenoSqlite3Dialect } from '@soapbox/kysely-deno-sqlite';

const databaseUrl = Deno.env.get('DATABASE_URL') ?? 'sqlite://:memory:';

const dialect: 'sqlite' | 'postgres' = (() => {
  const protocol = databaseUrl.split(':')[0];
  switch (protocol) {
    case 'sqlite':
      return 'sqlite';
    case 'postgres':
      return protocol;
    case 'postgresql':
      return 'postgres';
    default:
      throw new Error(`Unsupported protocol: ${protocol}`);
  }
})();

/** Create an database for testing. */
const createDB = async () => {
  let kysely: Kysely<DittoTables>;

  if (dialect === 'sqlite') {
    kysely = new Kysely<DittoTables>({
      dialect: new DenoSqlite3Dialect({
        database: new Sqlite(':memory:'),
      }),
    });
    await DittoDB.migrate(kysely);
  } else {
    kysely = await DittoDB.getInstance();
  }

  const eventsDB = new EventsDB(kysely);

  return {
    eventsDB,
    kysely,
    [Symbol.asyncDispose]: async () => {
      if (dialect === 'postgres') {
        for (
          const table of [
            'author_stats',
            'event_stats',
            'event_zaps',
            'kysely_migration',
            'kysely_migration_lock',
            'nip46_tokens',
            'pubkey_domains',
            'unattached_media',
            'nostr_events',
            'nostr_tags',
            'nostr_pgfts',
          ]
        ) {
          await kysely.schema.dropTable(table).ifExists().cascade().execute();
        }
        await kysely.destroy();
      }
    },
  };
};

Deno.test('count filters', async () => {
  await using db = await createDB();
  const { eventsDB } = db;

  const event1 = await eventFixture('event-1');

  assertEquals((await eventsDB.count([{ kinds: [1] }])).count, 0);
  await eventsDB.event(event1);
  assertEquals((await eventsDB.count([{ kinds: [1] }])).count, 1);
});

Deno.test('insert and filter events', async () => {
  await using db = await createDB();
  const { eventsDB } = db;

  const event1 = await eventFixture('event-1');
  await eventsDB.event(event1);

  assertEquals(await eventsDB.query([{ kinds: [1] }]), [event1]);
  assertEquals(await eventsDB.query([{ kinds: [3] }]), []);
  assertEquals(await eventsDB.query([{ since: 1691091000 }]), [event1]);
  assertEquals(await eventsDB.query([{ until: 1691091000 }]), []);
  assertEquals(
    await eventsDB.query([{ '#proxy': ['https://gleasonator.com/objects/8f6fac53-4f66-4c6e-ac7d-92e5e78c3e79'] }]),
    [event1],
  );
});

Deno.test('query events with domain search filter', async () => {
  const { eventsDB, kysely } = await createDB();

  const event1 = await eventFixture('event-1');
  await eventsDB.event(event1);

  assertEquals(await eventsDB.query([{}]), [event1]);
  assertEquals(await eventsDB.query([{ search: 'domain:localhost:4036' }]), []);
  assertEquals(await eventsDB.query([{ search: '' }]), [event1]);

  await kysely
    .insertInto('pubkey_domains')
    .values({ pubkey: event1.pubkey, domain: 'localhost:4036', last_updated_at: event1.created_at })
    .execute();

  assertEquals(await eventsDB.query([{ kinds: [1], search: 'domain:localhost:4036' }]), [event1]);
  assertEquals(await eventsDB.query([{ kinds: [1], search: 'domain:example.com' }]), []);
});

Deno.test('delete events', async () => {
  await using db = await createDB();
  const { eventsDB } = db;

  const [one, two] = [
    { id: '1', kind: 1, pubkey: 'abc', content: 'hello world', created_at: 1, sig: '', tags: [] },
    { id: '2', kind: 1, pubkey: 'abc', content: 'yolo fam', created_at: 2, sig: '', tags: [] },
  ];

  await eventsDB.event(one);
  await eventsDB.event(two);

  // Sanity check
  assertEquals(await eventsDB.query([{ kinds: [1] }]), [two, one]);

  await eventsDB.event({
    kind: 5,
    pubkey: one.pubkey,
    tags: [['e', one.id]],
    created_at: 0,
    content: '',
    id: '',
    sig: '',
  });

  assertEquals(await eventsDB.query([{ kinds: [1] }]), [two]);
});

Deno.test("user cannot delete another user's event", async () => {
  await using db = await createDB();
  const { eventsDB } = db;

  const event = { id: '1', kind: 1, pubkey: 'abc', content: 'hello world', created_at: 1, sig: '', tags: [] };
  await eventsDB.event(event);

  // Sanity check
  assertEquals(await eventsDB.query([{ kinds: [1] }]), [event]);

  await eventsDB.event({
    kind: 5,
    pubkey: 'def', // different pubkey
    tags: [['e', event.id]],
    created_at: 0,
    content: '',
    id: '',
    sig: '',
  });

  assertEquals(await eventsDB.query([{ kinds: [1] }]), [event]);
});

Deno.test('admin can delete any event', async () => {
  await using db = await createDB();
  const { eventsDB } = db;

  const [one, two] = [
    { id: '1', kind: 1, pubkey: 'abc', content: 'hello world', created_at: 1, sig: '', tags: [] },
    { id: '2', kind: 1, pubkey: 'abc', content: 'yolo fam', created_at: 2, sig: '', tags: [] },
  ];

  await eventsDB.event(one);
  await eventsDB.event(two);

  // Sanity check
  assertEquals(await eventsDB.query([{ kinds: [1] }]), [two, one]);

  await eventsDB.event({
    kind: 5,
    pubkey: Conf.pubkey, // Admin pubkey
    tags: [['e', one.id]],
    created_at: 0,
    content: '',
    id: '',
    sig: '',
  });

  assertEquals(await eventsDB.query([{ kinds: [1] }]), [two]);
});

Deno.test('throws a RelayError when inserting an event deleted by the admin', async () => {
  await using db = await createDB();
  const { eventsDB } = db;

  const event = genEvent();
  await eventsDB.event(event);

  const deletion = genEvent({ kind: 5, tags: [['e', event.id]] }, Conf.seckey);
  await eventsDB.event(deletion);

  await assertRejects(
    () => eventsDB.event(event),
    RelayError,
    'event deleted by admin',
  );
});

Deno.test('throws a RelayError when inserting an event deleted by a user', async () => {
  await using db = await createDB();
  const { eventsDB } = db;

  const sk = generateSecretKey();

  const event = genEvent({}, sk);
  await eventsDB.event(event);

  const deletion = genEvent({ kind: 5, tags: [['e', event.id]] }, sk);
  await eventsDB.event(deletion);

  await assertRejects(
    () => eventsDB.event(event),
    RelayError,
    'event deleted by user',
  );
});

Deno.test('inserting replaceable events', async () => {
  await using db = await createDB();
  const { eventsDB } = db;

  const event = await eventFixture('event-0');
  await eventsDB.event(event);

  const olderEvent = { ...event, id: '123', created_at: event.created_at - 1 };
  await eventsDB.event(olderEvent);
  assertEquals(await eventsDB.query([{ kinds: [0], authors: [event.pubkey] }]), [event]);

  const newerEvent = { ...event, id: '123', created_at: event.created_at + 1 };
  await eventsDB.event(newerEvent);
  assertEquals(await eventsDB.query([{ kinds: [0] }]), [newerEvent]);
});

Deno.test("throws a RelayError when querying an event with a large 'since'", async () => {
  await using db = await createDB();
  const { eventsDB } = db;

  await assertRejects(
    () => eventsDB.query([{ since: 33333333333333 }]),
    RelayError,
    'since filter too far into the future',
  );
});

Deno.test("throws a RelayError when querying an event with a large 'until'", async () => {
  await using db = await createDB();
  const { eventsDB } = db;

  await assertRejects(
    () => eventsDB.query([{ until: 66666666666666 }]),
    RelayError,
    'until filter too far into the future',
  );
});

Deno.test("throws a RelayError when querying an event with a large 'kind'", async () => {
  await using db = await createDB();
  const { eventsDB } = db;

  await assertRejects(
    () => eventsDB.query([{ kinds: [99999999999999] }]),
    RelayError,
    'kind filter too far into the future',
  );
});

Deno.test('query user by NIP-05 search filter', async () => {
  // implement
});
