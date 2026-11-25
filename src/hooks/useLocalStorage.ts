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

  // Keep the (potentially inline) serializers and default in refs so `setValue`
  // can stay referentially stable across renders — consumers put it in context
  // values and dependency arrays.
  const serializeRef = useRef(serialize);
  const deserializeRef = useRef(deserialize);
  const defaultValueRef = useRef(defaultValue);
  useEffect(() => {
    serializeRef.current = serialize;
    deserializeRef.current = deserialize;
    defaultValueRef.current = defaultValue;
  });

  const read = useCallback((k: string): T => {
    try {
      const item = localStorage.getItem(k);
      return item ? deserializeRef.current(item) : defaultValueRef.current;
    } catch (error) {
      console.warn(`Failed to load ${k} from localStorage:`, error);
      return defaultValueRef.current;
    }
  }, []);

  // The state remembers which key it was read from. When the key changes (e.g.
  // a user-scoped key switching to a different user), the new key's value is
  // read during this same render, so no commit ever pairs the new key with the
  // previous key's value. If it did, any updater run in that commit would
  // write the previous key's whole value into the new key — on an account
  // switch, that hands one account's stored config to the other.
  const [entry, setEntry] = useState(() => ({ key, value: read(key) }));
  let current = entry;
  if (entry.key !== key) {
    current = { key, value: read(key) };
    setEntry(current);
  }

  const setValue = useCallback((value: T | ((prev: T) => T)) => {
    // Use React's functional setState so the updater always receives the
    // latest state, even when multiple setValue calls are batched before a
    // re-render (fixes stale-closure resets on the first click).
    setEntry((prev) => {
      const base = prev.key === key ? prev.value : read(key);
      const next = value instanceof Function ? value(base) : value;
      // Skip if nothing changed (same reference)
      if (prev.key === key && next === prev.value) return prev;
      try {
        localStorage.setItem(key, serializeRef.current(next));
      } catch (error) {
        console.warn(`Failed to save ${key} to localStorage:`, error);
      }
      return { key, value: next };
    });
  }, [key, read]);

  // Sync with localStorage changes from other tabs
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === key && e.newValue !== null) {
        try {
          setEntry({ key, value: deserializeRef.current(e.newValue) });
        } catch (error) {
          console.warn(`Failed to sync ${key} from localStorage:`, error);
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [key]);

  return [current.value, setValue] as const;
}
