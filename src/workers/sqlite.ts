import * as Comlink from 'comlink';
import { asyncGeneratorTransferHandler } from 'comlink-async-generator';
import { CompiledQuery, QueryResult } from 'kysely';

import type { SqliteWorker as _SqliteWorker } from './sqlite.worker.ts';

Comlink.transferHandlers.set('asyncGenerator', asyncGeneratorTransferHandler);

class SqliteWorker {
  #worker: Worker;
  #client: ReturnType<typeof Comlink.wrap<typeof _SqliteWorker>>;
  #ready: Promise<void>;

  constructor() {
    this.#worker = new Worker(new URL('./sqlite.worker.ts', import.meta.url).href, { type: 'module' });
    this.#client = Comlink.wrap<typeof _SqliteWorker>(this.#worker);

    this.#ready = new Promise<void>((resolve) => {
      const handleEvent = (event: MessageEvent) => {
        if (event.data[0] === 'ready') {
          this.#worker.removeEventListener('message', handleEvent);
          resolve();
        }
      };
      this.#worker.addEventListener('message', handleEvent);
    });
  }

  async open(path: string): Promise<void> {
    await this.#ready;
    return this.#client.open(path);
  }

  async executeQuery<R>(query: CompiledQuery): Promise<QueryResult<R>> {
    await this.#ready;
    return this.#client.executeQuery(query) as Promise<QueryResult<R>>;
  }

  async *streamQuery<R>(query: CompiledQuery): AsyncIterableIterator<QueryResult<R>> {
    await this.#ready;

    for await (const result of await this.#client.streamQuery(query)) {
      yield result as QueryResult<R>;
    }
  }

  destroy(): Promise<void> {
    return this.#client.destroy();
  }
}

export default SqliteWorker;
