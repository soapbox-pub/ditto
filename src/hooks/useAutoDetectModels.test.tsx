import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

import { useAutoDetectModels } from './useAutoDetectModels';

const DEBOUNCE_MS = 700;

interface HookProps {
  apiKey: string;
  baseURL: string;
  userEdited: boolean;
  onDetect: () => void;
}

function baseProps(overrides: Partial<HookProps> = {}): HookProps {
  return {
    apiKey: '',
    baseURL: 'https://api.example.com/v1',
    userEdited: true,
    onDetect: vi.fn(),
    ...overrides,
  };
}

describe('useAutoDetectModels', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('fires onDetect exactly once, DEBOUNCE_MS after the last apiKey change', () => {
    const onDetect = vi.fn();
    const props = baseProps({ onDetect });
    const { rerender } = renderHook((p) => useAutoDetectModels(p), { initialProps: props });

    // A burst of keystrokes: each one resets the debounce window.
    act(() => {
      rerender({ ...props, apiKey: 'sk-1' });
      rerender({ ...props, apiKey: 'sk-12' });
      rerender({ ...props, apiKey: 'sk-123' });
    });

    act(() => {
      vi.advanceTimersByTime(DEBOUNCE_MS - 1);
    });
    expect(onDetect).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onDetect).toHaveBeenCalledTimes(1);
  });

  it('fires again after the debounce settles when the apiKey changes again', () => {
    const onDetect = vi.fn();
    const props = baseProps({ onDetect });
    const { rerender } = renderHook((p) => useAutoDetectModels(p), { initialProps: props });

    // Timers are scheduled by effect flushes, so rerender and the timer
    // advance must live in separate act calls.
    act(() => {
      rerender({ ...props, apiKey: 'sk-1' });
    });
    act(() => {
      vi.advanceTimersByTime(DEBOUNCE_MS);
    });
    expect(onDetect).toHaveBeenCalledTimes(1);

    act(() => {
      rerender({ ...props, apiKey: 'sk-2' });
    });
    act(() => {
      vi.advanceTimersByTime(DEBOUNCE_MS);
    });
    expect(onDetect).toHaveBeenCalledTimes(2);
  });

  it('does not fire when only the baseURL changes', () => {
    const onDetect = vi.fn();
    const props = baseProps({ apiKey: 'sk-abc', onDetect });
    const { rerender } = renderHook((p) => useAutoDetectModels(p), { initialProps: props });

    act(() => {
      rerender({ ...props, baseURL: 'https://other.example.com/v1' });
      vi.advanceTimersByTime(DEBOUNCE_MS + 100);
    });
    expect(onDetect).not.toHaveBeenCalled();
  });

  it('does not fire on an unrelated re-render (e.g. typing the name field)', () => {
    const first = vi.fn();
    const props = baseProps({ apiKey: 'sk-abc', onDetect: first });
    const { rerender } = renderHook((p) => useAutoDetectModels(p), { initialProps: props });

    // The dialog recreates the onDetect closure on every re-render, so an
    // unrelated field edit looks like a new onDetect with the same apiKey.
    const second = vi.fn();
    act(() => {
      rerender({ ...props, onDetect: second });
      vi.advanceTimersByTime(DEBOUNCE_MS + 100);
    });

    expect(first).not.toHaveBeenCalled();
    expect(second).not.toHaveBeenCalled();
  });

  it('does not fire when the apiKey changes but the baseURL is empty', () => {
    const onDetect = vi.fn();
    const props = baseProps({ baseURL: '', onDetect });
    const { rerender } = renderHook((p) => useAutoDetectModels(p), { initialProps: props });

    act(() => {
      rerender({ ...props, apiKey: 'sk-123' });
      vi.advanceTimersByTime(DEBOUNCE_MS + 100);
    });
    expect(onDetect).not.toHaveBeenCalled();
  });

  it('does not fire on a non-user apiKey change (dialog re-seed)', () => {
    const onDetect = vi.fn();
    const props = baseProps({ userEdited: false });
    const { rerender } = renderHook((p) => useAutoDetectModels(p), { initialProps: props });

    act(() => {
      rerender({ ...props, apiKey: 'sk-seeded' });
      vi.advanceTimersByTime(DEBOUNCE_MS + 100);
    });
    expect(onDetect).not.toHaveBeenCalled();
  });
});
