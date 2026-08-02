import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act, waitFor } from '@testing-library/react';
import { forwardRef, useImperativeHandle } from 'react';

import { useLuaLintSandbox } from './useLuaLintSandbox';
import type { LuaIssue } from './useLuaLintSandbox';

// ─── Mocks ─────────────────────────────────────────────────────────────────
// A real cross-origin SandboxFrame iframe can't run in jsdom. Replace it with
// a lightweight stub that exposes the same onRpc/postMessage contract, so the
// hook's own RPC bookkeeping (ready gating, pending-request map, timeouts) is
// exercised without any real iframe/postMessage machinery.

let latestOnRpc: ((method: string, params: unknown) => Promise<unknown>) | null = null;
const postedMessages: Record<string, unknown>[] = [];

vi.mock('@/components/SandboxFrame', () => ({
  SandboxFrame: forwardRef(function MockSandboxFrame(
    props: { onRpc?: (method: string, params: unknown) => Promise<unknown> },
    ref: React.Ref<{ postMessage: (msg: Record<string, unknown>) => void; focus: () => void }>,
  ) {
    latestOnRpc = props.onRpc ?? null;
    const postMessage = (msg: Record<string, unknown>) => {
      postedMessages.push(msg);
    };
    useImperativeHandle(ref, () => ({ postMessage, focus: () => {} }));
    return null;
  }),
}));

vi.mock('@/hooks/useAppContext', () => ({
  useAppContext: () => ({ config: { appId: 'test-app' } }),
}));

// bundle.generated.js is a build artifact that doesn't exist in this test
// environment (it's gitignored and produced by scripts/build-lua-lint-sandbox.mjs).
// The hook only needs *some* string back from the dynamic import.
vi.mock('../sandbox/luaLint/bundle.generated.js?raw', () => ({
  default: '(function(){})();',
}));

/**
 * `useLuaLintSandbox`'s returned `sandboxElement` must actually be mounted
 * for the (mocked) SandboxFrame to run — `renderHook` alone never renders a
 * hook's return value into the DOM. This harness renders the real hook and
 * its `sandboxElement`, and exposes the hook's return value via a mutable
 * holder the test can read/call into.
 */
type SandboxApi = ReturnType<typeof useLuaLintSandbox>;

function Harness({ apiRef }: { apiRef: { current: SandboxApi | null } }) {
  const api = useLuaLintSandbox();
  apiRef.current = api;
  return api.sandboxElement;
}

function renderSandbox() {
  const apiRef: { current: SandboxApi | null } = { current: null };
  render(<Harness apiRef={apiRef} />);
  return apiRef;
}

async function simulateReady() {
  await act(async () => {
    await latestOnRpc?.('luaLint.ready', undefined);
  });
}

beforeEach(() => {
  latestOnRpc = null;
  postedMessages.length = 0;
  vi.useRealTimers();
});

describe('useLuaLintSandbox', () => {
  it('resolves lint() with the issues returned via luaLint.result after readiness', async () => {
    const apiRef = renderSandbox();

    let lintPromise!: Promise<LuaIssue[]>;
    act(() => {
      lintPromise = apiRef.current!.lint('local x = 1');
    });

    // The sandbox element only mounts (and registers onRpc) once lint() has
    // triggered ensureReady() — wait for that render to flush.
    await waitFor(() => expect(latestOnRpc).not.toBeNull());
    await simulateReady();

    await waitFor(() => expect(postedMessages.length).toBeGreaterThan(0));
    const checkMsg = postedMessages.find((m) => m.method === 'luaLint.check') as
      | { params: { requestId: string; code: string } }
      | undefined;
    expect(checkMsg).toBeDefined();
    expect(checkMsg!.params.code).toBe('local x = 1');

    const issues = [{ line: 1, column: 1, code: '111', message: 'test issue' }];
    await act(async () => {
      await latestOnRpc?.('luaLint.result', { requestId: checkMsg!.params.requestId, issues });
    });

    await expect(lintPromise).resolves.toEqual(issues);
  });

  it('rejects lint() when luaLint.result carries an error', async () => {
    const apiRef = renderSandbox();

    let lintPromise!: Promise<LuaIssue[]>;
    act(() => {
      lintPromise = apiRef.current!.lint('bad code');
      lintPromise.catch(() => {}); // avoid a spurious unhandled-rejection window before the assertion below attaches
    });
    await waitFor(() => expect(latestOnRpc).not.toBeNull());
    await simulateReady();

    await waitFor(() => expect(postedMessages.length).toBeGreaterThan(0));
    const checkMsg = postedMessages.find((m) => m.method === 'luaLint.check') as
      | { params: { requestId: string } }
      | undefined;

    await act(async () => {
      await latestOnRpc?.('luaLint.result', { requestId: checkMsg!.params.requestId, error: 'boom' });
    });

    await expect(lintPromise).rejects.toThrow('boom');
  });

  it('rejects lint() if the sandbox never signals readiness (warm-up failure)', async () => {
    const apiRef = renderSandbox();

    let lintPromise!: Promise<LuaIssue[]>;
    act(() => {
      lintPromise = apiRef.current!.lint('local x = 1');
      lintPromise.catch(() => {}); // avoid a spurious unhandled-rejection window before the assertion below attaches
    });
    await waitFor(() => expect(latestOnRpc).not.toBeNull());

    await act(async () => {
      await latestOnRpc?.('luaLint.ready', { error: 'fengari failed to load' });
    });

    await expect(lintPromise).rejects.toThrow(/fengari failed to load/);
  });

  it('routes concurrent lint() calls to their own requestId without cross-talk', async () => {
    const apiRef = renderSandbox();

    let first!: Promise<LuaIssue[]>;
    act(() => {
      first = apiRef.current!.lint('code A');
    });
    await waitFor(() => expect(latestOnRpc).not.toBeNull());
    await simulateReady();

    let second!: Promise<LuaIssue[]>;
    act(() => {
      second = apiRef.current!.lint('code B');
    });
    await waitFor(() => expect(postedMessages.filter((m) => m.method === 'luaLint.check').length).toBe(2));

    const [msgA, msgB] = postedMessages.filter((m) => m.method === 'luaLint.check') as {
      params: { requestId: string; code: string };
    }[];
    expect(msgA.params.requestId).not.toBe(msgB.params.requestId);

    // Resolve out of order — second request's result arrives first.
    await act(async () => {
      await latestOnRpc?.('luaLint.result', { requestId: msgB.params.requestId, issues: [] });
    });
    await act(async () => {
      await latestOnRpc?.('luaLint.result', {
        requestId: msgA.params.requestId,
        issues: [{ line: 2, column: 1, code: '212', message: 'unused arg' }],
      });
    });

    await expect(second).resolves.toEqual([]);
    await expect(first).resolves.toEqual([{ line: 2, column: 1, code: '212', message: 'unused arg' }]);
  });

  it('rejects lint() if no response arrives before the timeout', async () => {
    vi.useFakeTimers();
    const apiRef = renderSandbox();

    let lintPromise: Promise<unknown>;
    act(() => {
      lintPromise = apiRef.current!.lint('local x = 1');
      lintPromise.catch(() => {}); // avoid a spurious unhandled-rejection window before the assertion below attaches
    });

    // Flush the microtask queue so ensureReady()'s dynamic import resolves
    // and the mock SandboxFrame mounts, without advancing real/fake timers.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      await latestOnRpc?.('luaLint.ready', undefined);
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });

    await expect(lintPromise!).rejects.toThrow(/did not respond in time/);
    vi.useRealTimers();
  });
});
