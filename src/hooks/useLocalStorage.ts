import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Generic hook for managing localStorage state
 */
export function useLocalStorage<T>(
  key: string,
  defaultValue: T,
  serializer?: {
    serialize: (value: T) => string;
    deserialize: (value: string) => T;
  }
) {
  const serialize = serializer?.serialize || JSON.stringify;
  const deserialize = serializer?.deserialize || JSON.parse;

  const [state, setState] = useState<T>(() => {
    try {
      const item = localStorage.getItem(key);
      return item ? deserialize(item) : defaultValue;
    } catch (error) {
      console.warn(`Failed to load ${key} from localStorage:`, error);
      return defaultValue;
    }
  });

  // Keep the (potentially inline) serializer in a ref so `setValue` can stay
  // referentially stable across renders — consumers put it in context values
  // and dependency arrays.
  const serializeRef = useRef(serialize);
  useEffect(() => {
    serializeRef.current = serialize;
  });

  const setValue = useCallback((value: T | ((prev: T) => T)) => {
    // Use React's functional setState so the updater always receives the
    // latest state, even when multiple setValue calls are batched before a
    // re-render (fixes stale-closure resets on the first click).
    setState((prev) => {
      const next = value instanceof Function ? value(prev) : value;
      // Skip if nothing changed (same reference)
      if (next === prev) return prev;
      try {
        localStorage.setItem(key, serializeRef.current(next));
      } catch (error) {
        console.warn(`Failed to save ${key} to localStorage:`, error);
      }
      return next;
    });
  }, [key]);

  // Re-read from localStorage when the key changes (e.g. user-scoped keys
  // switching to a different user). The useState initializer only runs once,
  // so changing the key prop requires an explicit re-sync.
  useEffect(() => {
    try {
      const item = localStorage.getItem(key);
      setState(item ? deserialize(item) : defaultValue);
    } catch (error) {
      console.warn(`Failed to load ${key} from localStorage:`, error);
      setState(defaultValue);
    }
  // defaultValue is intentionally excluded — we only want to re-read when
  // the key identity changes, not when a new default reference is passed.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Sync with localStorage changes from other tabs
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === key && e.newValue !== null) {
        try {
          setState(deserialize(e.newValue));
        } catch (error) {
          console.warn(`Failed to sync ${key} from localStorage:`, error);
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [key, deserialize]);

  return [state, setValue] as const;
}