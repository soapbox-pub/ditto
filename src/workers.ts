import { Conf } from '@/config.ts';
import SqliteWorker from '@/workers/sqlite.ts';

const sqliteWorker = new SqliteWorker(Conf.dbPath);

export { sqliteWorker };
