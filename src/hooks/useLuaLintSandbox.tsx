import { useCallback, useMemo, useRef, useState } from 'react';

import { SandboxFrame, type SandboxFrameHandle } from '@/components/SandboxFrame';
import { useAppContext } from '@/hooks/useAppContext';
import { deriveIframeSubdomain } from '@/lib/iframeSubdomain';
import type { FileResponse, InjectedScript } from '@/lib/sandbox';

/** Mirrors devkit's `LuaIssue` shape (avoids a hard runtime dependency on the package here). */
export interface LuaIssue {
  line: number;
  column: number;
  code: string;
  message: string;
}

/**
 * Permissive CSP for the Lua-lint sandbox. devkit's `luaLint` runs
 * fengari-web in-process, which needs `Function()` at module-load time.
 * Scoped to just this isolated cross-origin subdomain — Ditto's own
 * document CSP is untouched.
 */
const LUA_LINT_CSP = [
  "default-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

const SANDBOX_HTML = new TextEncoder().encode('<!doctype html><html><head></head><body></body></html>');

interface PendingCheck {
  resolve: (issues: LuaIssue[]) => void;
  reject: (err: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

const CHECK_TIMEOUT_MS = 10_000;

/**
 * Run devkit's `luaLint` inside an isolated, permissively-CSP'd sandbox.
 *
 * Renders nothing until the first `lint()` call — `sandboxElement` only
 * becomes a real `<SandboxFrame>` once linting is actually needed, so a
 * chat session that never touches Lua code never pays for mounting it.
 * The caller is responsible for rendering `sandboxElement` somewhere in
 * its own tree (it renders invisibly; the iframe does no visible work).
 */
export function useLuaLintSandbox() {
  const { config } = useAppContext();
  const [active, setActive] = useState(false);
  const sandboxRef = useRef<SandboxFrameHandle | null>(null);
  const readyRef = useRef<{ promise: Promise<void>; resolve: () => void; reject: (err: Error) => void } | null>(null);
  const pendingRef = useRef<Map<string, PendingCheck>>(new Map());

  const id = useMemo(() => deriveIframeSubdomain(config.appId, 'lualint', 'devkit'), [config.appId]);

  const resolveFile = useCallback(async (pathname: string): Promise<FileResponse | null> => {
    if (pathname === '/' || pathname === '/index.html') {
      return { status: 200, contentType: 'text/html', body: SANDBOX_HTML };
    }
    return null;
  }, []);

  const [bundleText, setBundleText] = useState<string | null>(null);

  const ensureReady = useCallback(async (): Promise<void> => {
    if (!active) setActive(true);

    if (bundleText === null) {
      const mod = await import('../sandbox/luaLint/bundle.generated.js?raw');
      setBundleText(mod.default);
    }

    if (!readyRef.current) {
      let resolve!: () => void;
      let reject!: (err: Error) => void;
      const promise = new Promise<void>((res, rej) => { resolve = res; reject = rej; });
      readyRef.current = { promise, resolve, reject };
    }
    return readyRef.current.promise;
    // bundleText intentionally omitted: this effect only needs to trigger
    // the fetch once; the promise identity below doesn't depend on it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const onRpc = useCallback(async (method: string, params: unknown): Promise<null> => {
    if (method === 'luaLint.ready') {
      const p = params as { error?: string } | undefined;
      if (p?.error) {
        readyRef.current?.reject(new Error(`Lua-lint sandbox failed to warm up: ${p.error}`));
      } else {
        readyRef.current?.resolve();
      }
      return null;
    }

    if (method === 'luaLint.result') {
      const p = params as { requestId: string; issues?: LuaIssue[]; error?: string };
      const pending = pendingRef.current.get(p.requestId);
      if (pending) {
        pendingRef.current.delete(p.requestId);
        clearTimeout(pending.timeout);
        if (p.error) {
          pending.reject(new Error(p.error));
        } else {
          pending.resolve(p.issues ?? []);
        }
      }
      return null;
    }

    return null;
  }, []);

  const lint = useCallback(async (code: string): Promise<LuaIssue[]> => {
    await ensureReady();

    const requestId = crypto.randomUUID();
    return new Promise<LuaIssue[]>((resolve, reject) => {
      const timeout = setTimeout(() => {
        pendingRef.current.delete(requestId);
        reject(new Error('Lua-lint sandbox did not respond in time'));
      }, CHECK_TIMEOUT_MS);

      pendingRef.current.set(requestId, { resolve, reject, timeout });

      sandboxRef.current?.postMessage({
        jsonrpc: '2.0',
        method: 'luaLint.check',
        params: { requestId, code },
      });
    });
  }, [ensureReady]);

  const injectedScripts = useMemo<InjectedScript[]>(() => {
    if (!bundleText) return [];
    return [{ path: '__injected__/lua-lint-sandbox.js', content: bundleText }];
  }, [bundleText]);

  const sandboxElement = active && bundleText !== null
    ? (
      <SandboxFrame
        ref={sandboxRef}
        id={id}
        resolveFile={resolveFile}
        onRpc={onRpc}
        injectedScripts={injectedScripts}
        csp={LUA_LINT_CSP}
        title="Lua lint sandbox"
        style={{ position: 'fixed', width: 0, height: 0, border: 0, opacity: 0, pointerEvents: 'none' }}
        aria-hidden="true"
        tabIndex={-1}
      />
    )
    : null;

  return { lint, sandboxElement };
}
