import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AppProvider } from '@/components/AppProvider';
import { APP_BLOSSOM_SERVERS } from '@/lib/appBlossom';
import type { AppConfig } from '@/contexts/AppContext';

import { useBlossomFallback, useBlossomServers, useSourceWalk } from './useBlossomFallback';

const HASH = 'a'.repeat(64);

/**
 * Only the Blossom fields matter here; the rest of the config is cast away
 * (a `theme` is the one other field AppProvider itself dereferences).
 */
function withConfig(config: Partial<AppConfig>) {
  return ({ children }: { children: React.ReactNode }) => (
    <AppProvider storageKey="test-blossom-fallback" defaultConfig={{ theme: 'light', ...config } as AppConfig}>
      {children}
    </AppProvider>
  );
}

const wrapper = withConfig({
  blossomServerMetadata: { servers: ['https://mine.example/'], updatedAt: 0 },
  useAppBlossomServers: false,
});

/**
 * The index every cross-server walk is driven by. It only moves on an explicit
 * failure, it stops at the end, and a new primary or a reset starts it over.
 */
describe('useSourceWalk', () => {
  it('steps through the candidates on advance and fails past the last', () => {
    const list = ['https://one/x', 'https://two/x'];
    const { result } = renderHook(() => useSourceWalk(list));
    expect(result.current.src).toBe('https://one/x');

    act(() => result.current.advance());
    expect(result.current.src).toBe('https://two/x');
    expect(result.current.failed).toBe(false);

    act(() => result.current.advance());
    expect(result.current.failed).toBe(true);
    expect(result.current.src).toBe('https://two/x');

    act(() => result.current.reset());
    expect(result.current.src).toBe('https://one/x');
    expect(result.current.failed).toBe(false);
  });

  it('starts over when the primary changes, in the same render', () => {
    const { result, rerender } = renderHook(({ list }) => useSourceWalk(list), {
      initialProps: { list: ['https://one/x', 'https://two/x'] },
    });
    act(() => result.current.advance());
    act(() => result.current.advance());
    expect(result.current.failed).toBe(true);

    rerender({ list: ['https://one/y', 'https://two/y'] });
    expect(result.current.src).toBe('https://one/y');
    expect(result.current.failed).toBe(false);
  });

  it('is never failed with nothing to try', () => {
    const { result } = renderHook(() => useSourceWalk([]));
    expect(result.current.failed).toBe(false);
    act(() => result.current.advance());
    expect(result.current.failed).toBe(false);
  });
});

describe('useBlossomServers', () => {
  it('reads the effective list from the app config', () => {
    const { result } = renderHook(() => useBlossomServers(), { wrapper });
    expect(result.current).toEqual(['https://mine.example/']);
  });

  it('falls back to the app defaults with no provider mounted', () => {
    // This sits under every avatar, so it has to render wherever one does.
    const { result } = renderHook(() => useBlossomServers());
    expect(result.current).toEqual(APP_BLOSSOM_SERVERS.servers);
  });
});

describe('useBlossomFallback', () => {
  it('walks a content-addressed URL across the other servers, then fails', () => {
    const url = `https://origin.example/${HASH}.png`;
    const { result } = renderHook(() => useBlossomFallback(url), { wrapper });
    expect(result.current.src).toBe(url);

    act(() => result.current.onError());
    expect(result.current.src).toBe(`https://mine.example/${HASH}.png`);
    expect(result.current.failed).toBe(false);

    act(() => result.current.onError());
    expect(result.current.failed).toBe(true);
  });

  it('tries declared fallbacks before derived mirrors', () => {
    const url = `https://origin.example/${HASH}`;
    const { result } = renderHook(() => useBlossomFallback(url, ['https://declared.example/blob']), { wrapper });
    act(() => result.current.onError());
    expect(result.current.src).toBe('https://declared.example/blob');
    act(() => result.current.onError());
    expect(result.current.src).toBe(`https://mine.example/${HASH}`);
  });

  it('gives an ordinary URL one attempt', () => {
    const { result } = renderHook(() => useBlossomFallback('https://photos.example/me.jpg'), { wrapper });
    act(() => result.current.onError());
    expect(result.current.failed).toBe(true);
  });

  it('is inert without a URL', () => {
    const { result } = renderHook(() => useBlossomFallback(undefined), { wrapper });
    expect(result.current.src).toBeUndefined();
    expect(result.current.failed).toBe(false);
  });
});
