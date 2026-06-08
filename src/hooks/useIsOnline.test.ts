import { describe, it, expect, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';

import { useIsOnline } from './useIsOnline';

function setNavigatorOnLine(value: boolean) {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(value);
}

describe('useIsOnline', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reflects the initial navigator.onLine value', () => {
    setNavigatorOnLine(true);
    const { result } = renderHook(() => useIsOnline());
    expect(result.current).toBe(true);
  });

  it('starts offline when navigator reports offline', () => {
    setNavigatorOnLine(false);
    const { result } = renderHook(() => useIsOnline());
    expect(result.current).toBe(false);
  });

  it('updates to false on the offline event', () => {
    setNavigatorOnLine(true);
    const { result } = renderHook(() => useIsOnline());
    expect(result.current).toBe(true);

    act(() => {
      setNavigatorOnLine(false);
      window.dispatchEvent(new Event('offline'));
    });

    expect(result.current).toBe(false);
  });

  it('updates back to true on the online event', () => {
    setNavigatorOnLine(false);
    const { result } = renderHook(() => useIsOnline());
    expect(result.current).toBe(false);

    act(() => {
      setNavigatorOnLine(true);
      window.dispatchEvent(new Event('online'));
    });

    expect(result.current).toBe(true);
  });
});
