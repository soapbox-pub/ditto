/**
 * Detect if this thread is running in a Worker context.
 *
 * https://stackoverflow.com/a/18002694
 */
export function isWorker(): boolean {
  // @ts-ignore This is fine.
  return typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope;
}
