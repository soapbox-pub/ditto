#!/usr/bin/env node
/**
 * Bundle the Lua-lint sandbox entry point into a single self-contained IIFE.
 *
 * devkit's `luaLint` runs fengari-web in-process, which needs `Function()`/
 * `'unsafe-eval'` at module-load time — incompatible with Ditto's main-
 * document CSP. The bundle produced here is served inside a SandboxFrame
 * instance (a genuinely cross-origin subdomain with its own relaxed CSP)
 * via `useLuaLintSandbox()`. The sandbox cannot resolve bare ES-module
 * imports at runtime (no node_modules, no import maps), so every
 * dependency (including fengari-web itself) must be inlined here.
 *
 * Usage:
 *   node scripts/build-lua-lint-sandbox.mjs
 */

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { rolldown } from 'rolldown';

const __dirname = dirname(fileURLToPath(import.meta.url));
const entry = resolve(__dirname, '../src/sandbox/luaLint/entry.ts');
const outFile = resolve(__dirname, '../src/sandbox/luaLint/bundle.generated.js');

const bundle = await rolldown({
  input: entry,
});

const { output } = await bundle.generate({
  format: 'iife',
  minify: true,
});

await bundle.close();

const chunk = output.find((o) => o.type === 'chunk');
if (!chunk) {
  console.error('build-lua-lint-sandbox: rolldown produced no JS chunk');
  process.exit(1);
}

writeFileSync(outFile, chunk.code);
console.log(`build-lua-lint-sandbox: wrote ${outFile} (${chunk.code.length} bytes)`);
