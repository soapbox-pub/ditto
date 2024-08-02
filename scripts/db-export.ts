import { Storages } from '@/storages.ts';

const store = await Storages.db();

console.warn('Exporting events...');

for await (const msg of store.req([{}])) {
  if (msg[0] === 'EVENT') console.log(JSON.stringify(msg[2]));
  if (msg[0] === 'EOSE') break;
  if (msg[0] === 'CLOSED') {
    console.error('Database closed unexpectedly');
    break;
  }
}

console.warn('Done!');
