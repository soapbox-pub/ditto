class SqliteWorker {
  #path: string;
  #worker: Worker;

  constructor(path: string) {
    this.#path = path;
    this.#worker = new Worker(new URL('./sqlite.worker.ts', import.meta.url).href, { type: 'module' });
  }

  open(): Promise<void> {
    return this.#call(['open', [this.#path]]);
  }

  query(sql: string, params?: any): Promise<unknown[]> {
    return this.#call(['query', [sql, params]]);
  }

  #call<T>(msg: [string, unknown[]]): Promise<T> {
    const id = crypto.randomUUID();

    this.#worker.postMessage([id, msg]);

    // TODO: use a hashmap instead of an event listener for better performance.
    return new Promise((resolve) => {
      const handleEvent = (event: MessageEvent<[string, T]>) => {
        const [_id, result] = event.data;
        if (_id === id) {
          this.#worker.removeEventListener('message', handleEvent);
          resolve(result);
        }
      };
      this.#worker.addEventListener('message', handleEvent);
    });
  }
}

export default SqliteWorker;
