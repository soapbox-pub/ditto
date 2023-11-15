import SqliteWorker from './workers/sqlite.ts';

const sqliteWorker = new SqliteWorker('./data/db.sqlite3');

export { sqliteWorker };