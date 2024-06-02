import { Stickynotes } from '@soapbox/stickynotes';

import { DittoDB } from '@/db/DittoDB.ts';
import { getTrendingNotes } from '@/trends/trending-notes.ts';
import { Time } from '@/utils/time.ts';
import { AdminSigner } from '@/signers/AdminSigner.ts';
import { handleEvent } from '@/pipeline.ts';

const console = new Stickynotes('ditto:trends');

async function updateTrendingNotesCache() {
  console.info('Updating trending notes cache...');
  const kysely = await DittoDB.getInstance();
  const yesterday = Math.floor((Date.now() - Time.days(1)) / 1000);
  const signal = AbortSignal.timeout(1000);

  const events = await getTrendingNotes(kysely, yesterday, 20);
  const signer = new AdminSigner();

  const label = await signer.signEvent({
    kind: 1985,
    content: '',
    tags: [
      ['L', 'pub.ditto.trends'],
      ['l', 'notes', 'pub.ditto.trends'],
      ...events.map(({ id }) => ['e', id]),
    ],
    created_at: Math.floor(Date.now() / 1000),
  });

  await handleEvent(label, signal);
  console.info('Trending notes cache updated.');
}

/** Start cron jobs for the application. */
export function cron() {
  Deno.cron('update trending notes cache', { minute: { every: 15 } }, updateTrendingNotesCache);
}