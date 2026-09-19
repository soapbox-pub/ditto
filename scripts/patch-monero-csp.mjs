#!/usr/bin/env node

/**
 * Removes `monero-ts`'s use of the `Function` constructor so the Monero wallet
 * can run under Ditto's Content Security Policy.
 *
 * Ditto's CSP (see the meta tag in `index.html`) is
 * `script-src 'self' 'wasm-unsafe-eval'`. The `wasm-unsafe-eval` keyword
 * permits compiling and instantiating WebAssembly — which is all the wasm
 * wallet2 build needs — but deliberately *not* `unsafe-eval`, so no string can
 * ever be evaluated as JavaScript. In a Nostr client where an `nsec` sits in
 * `localStorage`, that distinction is the difference between an XSS being
 * contained and it being instant key theft.
 *
 * `GenUtils.isBrowser()` detects its environment by building two throwaway
 * functions from source:
 *
 *     new Function("try {return this===window;}catch(e){return false;}")()
 *
 * The try/catch is *inside* the generated body, so it catches nothing: the CSP
 * refusal happens at construction, and the `EvalError` propagates out of
 * `isBrowser()`. That breaks the wallet before a single line of wallet code
 * runs, because `LibraryUtils` calls it from a **static class field**
 * (`WORKER_DIST_PATH_DEFAULT`), which is evaluated when the class is defined —
 * so `await import('monero-ts')` throws on its own.
 *
 * Both replacements below are semantically identical to the code they replace.
 * `this` inside a `Function`-constructed body is the global object in sloppy
 * mode, so `this === window` is asking whether the global object is `window`;
 * and in the branch where the jsdom check runs, `window` is already known to be
 * the global, so `navigator` and `window.navigator` are the same object. The
 * jsdom result in particular is load-bearing for the test suite — Vitest's
 * jsdom environment must keep reporting "not a browser".
 *
 * ## Why a postinstall patch rather than a Vite plugin
 *
 * The offending code exists in two places: the readable CommonJS source, and
 * an inlined copy inside the prebuilt webpack bundle `dist/monero.worker.js`.
 * A Rollup `transform` hook would catch both in a production build but miss the
 * dev server, where Vite pre-bundles CommonJS deps with esbuild and plugin
 * transforms don't run. Patching the installed files covers `dev`, `build`,
 * `test` and CI through one mechanism. Every one of Ditto's npm scripts starts
 * with `npm i`, which re-runs this.
 *
 * The script is idempotent, and **exits non-zero if it finds neither the
 * original code nor its own replacement** — so a `monero-ts` bump that moves
 * this code fails the install loudly instead of silently shipping a build that
 * dies under CSP.
 *
 * ## This is meant to be temporary
 *
 * Submitted upstream as https://github.com/woodser/monero-ts/pull/330, with the
 * same two replacements used here. If that lands, bumping `monero-ts` past it
 * makes this file redundant: the patch will report "found neither the
 * Function() call nor its replacement" and fail the install, which is the
 * signal to delete the script and its `postinstall` entry rather than to
 * re-point it at new line numbers.
 *
 * ## What is deliberately left alone
 *
 * Three other `Function(...)` call sites survive into the bundle and are all
 * harmless: lodash's `freeGlobal || freeSelf || Function('return this')()`
 * short-circuits on `self` in every browser and worker; `function-bind`'s
 * shim is unreachable because `Function.prototype.bind` is native; and
 * `is-generator-function`'s probe is wrapped in a real `try`/`catch`. The last
 * one still logs a CSP violation to the console from inside the worker — noisy,
 * but caught, so sync is unaffected.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const PKG_ROOT = path.resolve('node_modules/monero-ts/dist');

/** Files carrying a copy of `GenUtils.isBrowser`. */
const TARGETS = [
  // The readable CommonJS source, used by the main-thread bundle.
  'src/main/ts/common/GenUtils.js',
  // The prebuilt webpack worker bundle, which inlines its own copy. Minified,
  // but the string literals are byte-identical to the source above.
  'monero.worker.js',
];

/**
 * Expression-level rewrites. Each `from` is replaced verbatim, so the result
 * slots into either the readable (`cond ? x : false`) or minified (`!!e&&x`)
 * form without needing to know which.
 */
const REPLACEMENTS = [
  {
    from: 'new Function("try {return this===window;}catch(e){return false;}")()',
    to: '(typeof window!=="undefined"&&globalThis===window)',
  },
  {
    from:
      'new Function("try {return window.navigator.userAgent.includes(\'jsdom\');}' +
      'catch(e){return false;}")()',
    to: '(typeof navigator!=="undefined"&&navigator.userAgent.includes("jsdom"))',
  },
];

const errors = [];
let patchedFiles = 0;
let alreadyPatched = 0;

if (!fs.existsSync(PKG_ROOT)) {
  // Not an error: `postinstall` can run in a tree where the dependency isn't
  // present yet (or was pruned). The build would fail on the import anyway.
  console.log('patch-monero-csp: monero-ts not installed, nothing to do.');
  process.exit(0);
}

for (const relPath of TARGETS) {
  const filePath = path.join(PKG_ROOT, relPath);

  if (!fs.existsSync(filePath)) {
    errors.push(`${relPath}: expected file is missing from monero-ts`);
    continue;
  }

  const original = fs.readFileSync(filePath, 'utf-8');
  let source = original;

  for (const { from, to } of REPLACEMENTS) {
    if (source.includes(from)) {
      source = source.split(from).join(to);
      continue;
    }
    if (source.includes(to)) continue; // already patched
    errors.push(
      `${relPath}: found neither the Function() call nor its replacement. ` +
        `monero-ts has changed upstream and this patch needs updating. ` +
        `Looked for: ${JSON.stringify(from)}`,
    );
  }

  if (source === original) {
    alreadyPatched += 1;
    continue;
  }

  fs.writeFileSync(filePath, source);
  patchedFiles += 1;
}

if (errors.length) {
  console.error(`patch-monero-csp: ${errors.length} problem(s):\n`);
  for (const error of errors) console.error(`  ${error}`);
  console.error(
    '\nThe Monero wallet will fail under Ditto\'s CSP until this is resolved.\n' +
      'See the header comment in scripts/patch-monero-csp.mjs.',
  );
  process.exit(1);
}

if (patchedFiles) {
  console.log(`patch-monero-csp: patched ${patchedFiles} file(s) for CSP compliance.`);
} else {
  console.log(`patch-monero-csp: ${alreadyPatched} file(s) already patched.`);
}
