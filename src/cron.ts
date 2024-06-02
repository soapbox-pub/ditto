import { Stickynotes } from '@soapbox/stickynotes';

import { Conf } from '@/config.ts';
import { DittoDB } from '@/db/DittoDB.ts';
import { handleEvent } from '@/pipeline.ts';
import { AdminSigner } from '@/signers/AdminSigner.ts';
import { getTrendingEvents } from '@/trends/trending-events.ts';
import { getTrendingTagValues } from '@/trends/trending-tag-values.ts';
import { Time } from '@/utils/time.ts';

const console = new Stickynotes('ditto:trends');

async function updateTrendingNotesCache() {
  console.info('Updating trending notes cache...');
  const kysely = await DittoDB.getInstance();
  const signal = AbortSignal.timeout(1000);

  const yesterday = Math.floor((Date.now() - Time.days(1)) / 1000);
  const now = Math.floor(Date.now() / 1000);

  const events = await getTrendingEvents(kysely, {
    kinds: [1],
    since: yesterday,
    until: now,
    limit: 40,
  });

  const signer = new AdminSigner();

  const label = await signer.signEvent({
    kind: 1985,
    content: '',
    tags: [
      ['L', 'pub.ditto.trends'],
      ['l', 'notes', 'pub.ditto.trends'],
      ...events.map(({ id }) => ['e', id, Conf.relay]),
    ],
    created_at: Math.floor(Date.now() / 1000),
  });

  await handleEvent(label, signal);
  console.info('Trending notes cache updated.');
}

async function updateTrendingHashtagsCache() {
  console.info('Updating trending hashtags cache...');
  const kysely = await DittoDB.getInstance();
  const signal = AbortSignal.timeout(1000);

  const yesterday = Math.floor((Date.now() - Time.days(1)) / 1000);
  const now = Math.floor(Date.now() / 1000);

  const hashtags = await getTrendingTagValues(kysely, 't', {
    since: yesterday,
    until: now,
    limit: 20,
  });

  const signer = new AdminSigner();

  const label = await signer.signEvent({
    kind: 1985,
    content: '',
    tags: [
      ['L', 'pub.ditto.trends'],
      ['l', 'hashtags', 'pub.ditto.trends'],
      ...hashtags.map(({ value, authors, uses }) => ['t', value, authors.toString(), uses.toString()]),
    ],
    created_at: Math.floor(Date.now() / 1000),
  });

  await handleEvent(label, signal);
  console.info('Trending hashtags cache updated.');
}

async function updateTrendingLinksCache() {
  console.info('Updating trending links cache...');
  const kysely = await DittoDB.getInstance();
  const signal = AbortSignal.timeout(1000);

  const yesterday = Math.floor((Date.now() - Time.days(1)) / 1000);
  const now = Math.floor(Date.now() / 1000);

  const links = await getTrendingTagValues(kysely, 'r', {
    since: yesterday,
    until: now,
    limit: 20,
  });

  const signer = new AdminSigner();

  const label = await signer.signEvent({
    kind: 1985,
    content: '',
    tags: [
      ['L', 'pub.ditto.trends'],
      ['l', 'links', 'pub.ditto.trends'],
      ...links.map(({ value, authors, uses }) => ['r', value, authors.toString(), uses.toString()]),
    ],
    created_at: Math.floor(Date.now() / 1000),
  });

  await handleEvent(label, signal);
  console.info('Trending links cache updated.');
}

/** Start cron jobs for the application. */
export function cron() {
  Deno.cron('update trending notes cache', '15 * * * *', updateTrendingNotesCache);
  Deno.cron('update trending hashtags cache', '30 * * * *', updateTrendingHashtagsCache);
  Deno.cron('update trending links cache', '45 * * * *', updateTrendingLinksCache);
}
