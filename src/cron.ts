import { Stickynotes } from '@soapbox/stickynotes';

import { Conf } from '@/config.ts';
import { DittoDB } from '@/db/DittoDB.ts';
import { handleEvent } from '@/pipeline.ts';
import { AdminSigner } from '@/signers/AdminSigner.ts';
import { getTrendingEvents } from '@/trends/trending-events.ts';
import { getTrendingTagValues } from '@/trends/trending-tag-values.ts';
import { Time } from '@/utils/time.ts';

const console = new Stickynotes('ditto:trends');

async function updateTrendingNotes() {
  console.info('Updating trending notes...');
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

  if (!events.length) {
    return;
  }

  const signer = new AdminSigner();

  const label = await signer.signEvent({
    kind: 1985,
    content: '',
    tags: [
      ['L', 'pub.ditto.trends'],
      ['l', '#e', 'pub.ditto.trends'],
      ...events.map(({ id }) => ['e', id, Conf.relay]),
    ],
    created_at: Math.floor(Date.now() / 1000),
  });

  await handleEvent(label, signal);
  console.info('Trending notes updated.');
}

async function updateTrendingTags(tagName: string, limit: number, extra = '') {
  console.info(`Updating trending #${tagName}...`);
  const kysely = await DittoDB.getInstance();
  const signal = AbortSignal.timeout(1000);

  const yesterday = Math.floor((Date.now() - Time.days(1)) / 1000);
  const now = Math.floor(Date.now() / 1000);

  const trends = await getTrendingTagValues(kysely, tagName, {
    since: yesterday,
    until: now,
    limit,
  });

  if (!trends.length) {
    return;
  }

  const signer = new AdminSigner();

  const label = await signer.signEvent({
    kind: 1985,
    content: '',
    tags: [
      ['L', 'pub.ditto.trends'],
      ['l', `#${tagName}`, 'pub.ditto.trends'],
      ...trends.map(({ value, authors, uses }) => [tagName, value, extra, authors.toString(), uses.toString()]),
    ],
    created_at: Math.floor(Date.now() / 1000),
  });

  await handleEvent(label, signal);
  console.info(`Trending #${tagName} updated.`);
}

/** Start cron jobs for the application. */
export function cron() {
  Deno.cron('update trending notes', '15 * * * *', updateTrendingNotes);
  Deno.cron('update trending hashtags', '30 * * * *', () => updateTrendingTags('t', 20));
  Deno.cron('update trending links', '45 * * * *', () => updateTrendingTags('r', 20));
}
