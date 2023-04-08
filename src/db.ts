import { lmdb } from '@/deps.ts';

const db = lmdb.open('db', {});

const gossipDB = db.openDB('gossip', { dupSort: true });

export { db, gossipDB };
