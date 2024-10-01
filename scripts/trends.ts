import * as dotenv from '@std/dotenv';
import { z } from 'zod';

import {
  updateTrendingEvents,
  updateTrendingHashtags,
  updateTrendingLinks,
  updateTrendingPubkeys,
  updateTrendingZappedEvents,
} from '@/trends.ts';

await dotenv.load({
  export: true,
  defaultsPath: null,
  examplePath: null,
});

const trendSchema = z.enum(['pubkeys', 'zapped_events', 'events', 'hashtags', 'links']);
const trends = trendSchema.array().parse(Deno.args);

if (!trends.length) {
  trends.push('pubkeys', 'zapped_events', 'events', 'hashtags', 'links');
}

for (const trend of trends) {
  switch (trend) {
    case 'pubkeys':
      console.log('Updating trending pubkeys...');
      await updateTrendingPubkeys();
      break;
    case 'zapped_events':
      console.log('Updating trending zapped events...');
      await updateTrendingZappedEvents();
      break;
    case 'events':
      console.log('Updating trending events...');
      await updateTrendingEvents();
      break;
    case 'hashtags':
      console.log('Updating trending hashtags...');
      await updateTrendingHashtags();
      break;
    case 'links':
      console.log('Updating trending links...');
      await updateTrendingLinks();
      break;
  }
}

console.log('Trends updated.');
Deno.exit(0);
