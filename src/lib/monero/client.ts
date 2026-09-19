/**
 * Lazy loader for `monero-ts`.
 *
 * `monero-ts` is monero-project's `wallet2` compiled to WebAssembly. The
 * module is ~3 MB (the wasm is base64-embedded via emscripten's `SINGLE_FILE`)
 * plus a ~3.6 MB Web Worker. That is far too much to put in Ditto's main
 * bundle for a feature most users never open, so **every** entry point into
 * the Monero wallet goes through `loadMonero()`, which `import()`s the module
 * on first use. Vite emits it as a separate chunk; nothing is fetched until a
 * user actually opens the Monero wallet.
 *
 * Never add a top-level `import ... from 'monero-ts'` anywhere in `src/` — it
 * would pull the whole thing into the entry chunk and undo this.
 *
 * ## The worker
 *
 * `monero-ts` runs each wallet in a Web Worker by default (`proxyToWorker`),
 * which is what keeps a multi-minute chain scan from freezing the UI thread.
 * Its built-in loader expects to find `/monero.worker.js` at the site root; we
 * instead hand it an explicit loader built on `new URL(..., import.meta.url)`
 * so Vite fingerprints and emits the worker as a build asset. That also means
 * the LibreJS banner in `vite.config.ts` can reach it — see the `.js` asset
 * branch of `librejsLicense()`.
 */
import type moneroTs from 'monero-ts';

/** The `monero-ts` module namespace. */
export type MoneroModule = typeof moneroTs;

let modulePromise: Promise<MoneroModule> | null = null;

/**
 * Load (and cache) the `monero-ts` module, wiring up the worker loader.
 *
 * Safe to call repeatedly and concurrently — the promise is memoized, so the
 * chunk is fetched and the wasm instantiated exactly once per page load.
 */
export function loadMonero(): Promise<MoneroModule> {
  if (!modulePromise) {
    modulePromise = (async () => {
      const monero = await import('monero-ts');

      monero.LibraryUtils.setWorkerLoader(
        () =>
          new Worker(new URL('monero-ts/dist/monero.worker.js', import.meta.url), {
            type: 'module',
          }),
      );

      return monero;
    })();

    // Don't cache a rejected load — a transient chunk-fetch failure (offline,
    // a stale service worker) would otherwise poison the wallet for the rest
    // of the session with no way to retry.
    modulePromise.catch(() => {
      modulePromise = null;
    });
  }

  return modulePromise;
}

/** Whether the Monero module has already been loaded this session. */
export function isMoneroLoaded(): boolean {
  return modulePromise !== null;
}

/**
 * Tear down `monero-ts`'s worker pool.
 *
 * Called on logout so a subsequent login doesn't inherit the previous
 * account's worker state.
 */
export async function shutdownMonero(): Promise<void> {
  if (!modulePromise) return;
  try {
    const monero = await modulePromise;
    await monero.shutdown();
  } catch {
    // Already torn down, or the module never finished loading.
  } finally {
    modulePromise = null;
  }
}
