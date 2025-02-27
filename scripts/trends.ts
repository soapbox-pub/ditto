import { DittoConf } from '@ditto/conf';
import { DittoPolyPg } from '@ditto/db';
import { z } from 'zod';

import { DittoPgStore } from '../packages/ditto/storages/DittoPgStore.ts';
import {
  updateTrendingEvents,
  updateTrendingHashtags,
  updateTrendingLinks,
  updateTrendingPubkeys,
  updateTrendingZappedEvents,
} from '../packages/ditto/trends.ts';

const conf = new DittoConf(Deno.env);
const db = new DittoPolyPg(conf.databaseUrl);
const relay = new DittoPgStore({ db, conf });
const ctx = { conf, db, relay };

const trendSchema = z.enum(['pubkeys', 'zapped_events', 'events', 'hashtags', 'links']);
const trends = trendSchema.array().parse(Deno.args);

if (!trends.length) {
  trends.push('pubkeys', 'zapped_events', 'events', 'hashtags', 'links');
}

for (const trend of trends) {
  switch (trend) {
    case 'pubkeys':
      console.log('Updating trending pubkeys...');
      await updateTrendingPubkeys(ctx);
      break;
    case 'zapped_events':
      console.log('Updating trending zapped events...');
      await updateTrendingZappedEvents(ctx);
      break;
    case 'events':
      console.log('Updating trending events...');
      await updateTrendingEvents(ctx);
      break;
    case 'hashtags':
      console.log('Updating trending hashtags...');
      await updateTrendingHashtags(ctx);
      break;
    case 'links':
      console.log('Updating trending links...');
      await updateTrendingLinks(ctx);
      break;
  }
}

console.log('Trends updated.');
Deno.exit(0);
