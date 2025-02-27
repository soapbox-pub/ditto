import { DittoConf } from '@ditto/conf';
import { DittoPolyPg } from '@ditto/db';
import { NostrFilter } from '@nostrify/nostrify';
import { Command, InvalidOptionArgumentError } from 'commander';

import { DittoPgStore } from '../packages/ditto/storages/DittoPgStore.ts';

const conf = new DittoConf(Deno.env);
const db = new DittoPolyPg(conf.databaseUrl);
const relay = new DittoPgStore({ db, conf });

interface ExportFilter {
  authors?: string[];
  ids?: string[];
  kinds?: number[];
  limit?: number;
  search?: string;
  /**
   * Array of `key=value` pairs.
   */
  tags?: string[];
  since?: number;
  until?: number;
  /**
   * shortcut for `--tag d=<value>`
   */
  d?: string;
  /**
   * shortcut for `--tag e=<value>`
   */
  e?: string;
  /**
   * shortcut for `--tag p=<value>`
   */
  p?: string;
}

function safeParseInt(s: string) {
  const n = parseInt(s);
  if (isNaN(n)) throw new InvalidOptionArgumentError('Not a number.');
  return n;
}

function findInvalid(arr: string[], predicate = (v: string) => !/[a-f0-9]{64}/.test(v)) {
  return arr.find(predicate);
}

function die(code: number, ...args: unknown[]) {
  console.error(...args);
  Deno.exit(code);
}

function tagFilterShortcut(name: 'd' | 'e' | 'p', value: string) {
  const val = [value];
  if (findInvalid(val)) throw new Error(`ERROR: Invalid value supplied for ${name}-tag.`);
  return val;
}

export function buildFilter(args: ExportFilter) {
  const filter: NostrFilter = {};
  const { authors, ids, kinds, d, e, limit, p, search, since, until, tags } = args;
  if (since) {
    filter.since = since;
  }
  if (until) {
    filter.until = until;
  }
  if (authors && authors.length) {
    const invalid = findInvalid(authors);
    if (invalid) throw new Error(`ERROR: Invalid pubkey ${invalid} supplied.`);
    filter.authors = authors;
  }
  if (ids && ids.length) {
    const invalid = findInvalid(ids);
    if (invalid) throw new Error(`ERROR: Invalid event ID ${invalid} supplied.`);
    filter.ids = ids;
  }
  if (kinds && kinds.length) {
    filter.kinds = kinds;
  }
  if (d) {
    filter['#d'] = [d];
  }
  if (e) {
    filter['#e'] = tagFilterShortcut('e', e);
  }
  if (p) {
    filter['#p'] = tagFilterShortcut('e', p);
  }
  if (search) {
    filter.search = search;
  }
  if (limit) {
    filter.limit = limit;
  }
  if (tags) {
    for (const val of tags) {
      const [name, ...values] = val.split('=');
      filter[`#${name}`] = [values.join('=')];
    }
  }

  return filter;
}

async function exportEvents(args: ExportFilter) {
  let filter: NostrFilter = {};
  try {
    filter = buildFilter(args);
  } catch (e) {
    die(1, e instanceof Error ? e.message : e);
  }

  let count = 0;
  for await (const msg of relay.req([filter])) {
    if (msg[0] === 'EOSE') {
      break;
    }
    if (msg[0] === 'EVENT') {
      console.log(JSON.stringify(msg[2]));
      count++;
    }
    if (msg[0] === 'CLOSED') {
      console.error('Database closed unexpectedly');
      break;
    }
  }

  console.warn(`Exported ${count} events`);
}

if (import.meta.main) {
  const exporter = new Command()
    .name('db:export')
    .description('Export the specified set of events from the Ditto database, in JSONL format.')
    .version('0.1.0')
    .showHelpAfterError();

  exporter
    .option('-a, --authors <authors...>', 'Pubkeys of authors whose events you want to export.', [])
    .option('-i, --ids <ids...>', 'IDs of events you want to export.', [])
    .option(
      '-k --kinds <kinds...>',
      'Event kinds you want to export.',
      (v: string, arr: number[]) => arr.concat([safeParseInt(v)]),
      [],
    )
    .option(
      '-t --tags <tag pairs...>',
      'A list of key=value pairs of tags to search for events using. For tag values with spaces etc, simply quote the entire item, like `deno task db:export -t "name=A string with spaces in it"`.',
      [],
    )
    .option('--search <search string>', 'A string to full-text search the db for.')
    .option('-s --since <number>', 'The oldest time an exported event should be from.', safeParseInt)
    .option('-u --until <number>', 'The newest time an exported event should be from.', safeParseInt)
    .option('--limit <number>', 'Maximum number of events to export.', safeParseInt)
    .option('-d <string>', 'Shortcut for `--tag d=<value>`.')
    .option('-e <string>', 'Shortcut for `--tag e=<value>`.')
    .option('-p <string>', 'Shortcut for `--tag p=<value>`.')
    .action(exportEvents);

  await exporter.parseAsync(Deno.args, { from: 'user' });
}
