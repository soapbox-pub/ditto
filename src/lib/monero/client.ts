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
 * ## The worker, and why it must be a *classic* worker
 *
 * `monero-ts` runs each wallet in a Web Worker by default (`proxyToWorker`),
 * which is what keeps a multi-minute chain scan from freezing the UI thread.
 * Its built-in loader expects to find `/monero.worker.js` at the site root; we
 * instead import the prebuilt bundle with `?url`, so Vite fingerprints and
 * emits it as a build asset (which also puts it in reach of the LibreJS banner
 * in `vite.config.ts` — see the `.js` asset branch of `librejsLicense()`).
 *
 * **Do not pass `{ type: 'module' }` here.** A module worker runs in strict
 * mode no matter what the file contains, and emscripten's generated HTTP glue
 * in `monero.js` reads its collaborators off `this`:
 *
 *     function(url, method, body, timeout) {
 *       const HttpClient = this.HttpClient;
 *       const LibraryUtils = this.LibraryUtils;
 *
 * Those are the globals `LibraryUtils.initWasmModule()` assigns to
 * `globalThis`, and the code reaches them by relying on a plain call getting
 * `this === globalThis` — which is only true in sloppy mode. Under strict mode
 * `this` is `undefined` and the wallet dies with "Cannot read properties of
 * undefined (reading 'HttpClient')" the moment wallet2 makes its first request
 * to a node. `monero.js` carries no `"use strict"` precisely because it
 * depends on this.
 *
 * Loading it classic is also what upstream's own Vite sample does (it copies
 * the file to `public/` and lets the default loader fetch it), so this is the
 * arrangement `monero-ts` is actually tested against.
 *
 * The URL comes from the `ditto:monero-worker` plugin in `vite.config.ts`,
 * which serves the prebuilt bundle byte-for-byte in dev and emits it as a
 * root-level asset in build. Vite's own mechanisms can't be used: `?url`
 * resolves to a `/node_modules/…` path in dev that the transform pipeline
 * rewrites into ESM, and `new Worker(new URL(…))` re-bundles the file.
 */
import type moneroTs from 'monero-ts';

import moneroWorkerUrl from 'virtual:monero-worker-url';

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

      // Classic worker — see the note above. No `type: 'module'`.
      monero.LibraryUtils.setWorkerLoader(() => new Worker(moneroWorkerUrl));

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
