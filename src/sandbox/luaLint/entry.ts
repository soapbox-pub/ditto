/**
 * Lua-lint sandbox entry point.
 *
 * Runs inside a SandboxFrame instance (a genuinely cross-origin subdomain
 * with its own relaxed CSP) because devkit's `luaLint` runs fengari-web
 * in-process, which needs `Function()`/`'unsafe-eval'` at module-load time —
 * incompatible with Ditto's main-document CSP. This file is bundled as a
 * single self-contained IIFE (see scripts/build-lua-lint-sandbox.mjs) since
 * the sandbox cannot resolve bare ES-module imports at runtime.
 *
 * Protocol (see src/hooks/useLuaLintSandbox.ts for the parent side):
 * - sandbox -> parent: JSON-RPC *requests* (have an id), handled by the
 *   parent's SandboxFrame `onRpc` prop. Notifications from the sandbox are
 *   silently dropped by SandboxFrame, so every outbound message here must
 *   carry an id.
 *     - { method: 'luaLint.ready' }               — sent once, on warm-up.
 *     - { method: 'luaLint.result', params: { requestId, issues } }
 *     - { method: 'luaLint.result', params: { requestId, error } }
 * - parent -> sandbox: plain postMessage notifications (bypass SandboxFrame's
 *   inbound parsing entirely — sent via the imperative handle).
 *     - { method: 'luaLint.check', params: { requestId, code } }
 */

import { luaLint } from '@soapbox.pub/nostr-canvas/devkit';

let nextId = 1;

function post(method: string, params?: unknown): void {
  window.parent.postMessage(
    { jsonrpc: '2.0', id: nextId++, method, params },
    '*',
  );
}

interface CheckParams {
  requestId: string;
  code: string;
}

function isCheckMessage(data: unknown): data is { jsonrpc: '2.0'; method: 'luaLint.check'; params: CheckParams } {
  if (!data || typeof data !== 'object') return false;
  const msg = data as Record<string, unknown>;
  if (msg.jsonrpc !== '2.0' || msg.method !== 'luaLint.check') return false;
  const params = msg.params as CheckParams | undefined;
  return !!params && typeof params.requestId === 'string' && typeof params.code === 'string';
}

window.addEventListener('message', (event: MessageEvent) => {
  if (!isCheckMessage(event.data)) return;
  const { requestId, code } = event.data.params;

  luaLint(code)
    .then((issues) => {
      post('luaLint.result', { requestId, issues });
    })
    .catch((err: unknown) => {
      post('luaLint.result', { requestId, error: err instanceof Error ? err.message : String(err) });
    });
});

// Warm the engine once up front (first-lint latency includes spinning up
// the whole luacheck-in-fengari VM) and only announce readiness once that
// completes — a `luaLint.check` that arrives before the engine is warm
// would just queue behind the same warm-up promise inside devkit anyway,
// but signaling ready only after warm-up gives the parent an honest
// "first call will be fast" guarantee.
luaLint('local _ = 1')
  .then(() => post('luaLint.ready'))
  .catch((err: unknown) => {
    post('luaLint.ready', { error: err instanceof Error ? err.message : String(err) });
  });
