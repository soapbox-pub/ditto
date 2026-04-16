import { useState, useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { secureStorage } from '@/lib/secureStorage';

/**
 * Hook for storing sensitive state that should not live in plaintext
 * localStorage on native platforms.
 *
 * - On web: uses `localStorage` (identical to `useLocalStorage`).
 * - On native (Capacitor iOS/Android): uses the native Keychain / KeyStore via
 *   `secureStorage`. Any existing plaintext value in localStorage for the same
 *   key is migrated on first read and the plaintext copy is removed.
 *
 * This is async under the hood, so the hook additionally exposes a `ready`
 * flag indicating whether the initial load has completed. While `!ready`, the
 * state is `defaultValue` and callers should avoid making decisions based on
 * an "empty" state (e.g. do not persist a default back if the user has real
 * data stored that hasn't been loaded yet).
 *
 * The return tuple is `[state, setValue, ready]`.
 */
export function useSecureLocalStorage<T>(
  key: string,
  defaultValue: T,
  serializer?: {
    serialize: (value: T) => string;
    deserialize: (value: string) => T;
  },
) {
  const serialize = serializer?.serialize || JSON.stringify;
  const deserialize = serializer?.deserialize || JSON.parse;

  const isNative = Capacitor.isNativePlatform();

  // On web we can read synchronously during initialization (same behavior as
  // useLocalStorage). On native we must wait for the async read, so we start
  // with defaultValue and flip `ready` once loaded.
  const [state, setState] = useState<T>(() => {
    if (isNative) return defaultValue;
    try {
      const item = localStorage.getItem(key);
      return item ? deserialize(item) : defaultValue;
    } catch (error) {
      console.warn(`Failed to load ${key} from localStorage:`, error);
      return defaultValue;
    }
  });

  const [ready, setReady] = useState<boolean>(!isNative);

  // Track the most-recently-requested key so stale async reads don't clobber
  // state after the caller swapped to a different key.
  const currentKeyRef = useRef(key);
  currentKeyRef.current = key;

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        if (isNative) {
          // Check secureStorage first (handles migration from plaintext
          // localStorage internally per secureStorage.getItem).
          const item = await secureStorage.getItem(key);
          if (cancelled || currentKeyRef.current !== key) return;
          setState(item ? deserialize(item) : defaultValue);
        } else {
          const item = localStorage.getItem(key);
          if (cancelled || currentKeyRef.current !== key) return;
          setState(item ? deserialize(item) : defaultValue);
        }
      } catch (error) {
        if (!cancelled) {
          console.warn(`Failed to load ${key} from secure storage:`, error);
          setState(defaultValue);
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    }

    setReady(false);
    load();

    return () => {
      cancelled = true;
    };
    // defaultValue and deserialize are intentionally excluded — we only want to
    // re-read when the key identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, isNative]);

  const setValue = (value: T | ((prev: T) => T)) => {
    const persist = (next: T) => {
      try {
        const serialized = serialize(next);
        if (isNative) {
          // Fire-and-forget; errors are logged but shouldn't block the caller.
          void secureStorage.setItem(key, serialized).catch((error) => {
            console.warn(`Failed to save ${key} to secure storage:`, error);
          });
        } else {
          localStorage.setItem(key, serialized);
        }
      } catch (error) {
        console.warn(`Failed to serialize ${key}:`, error);
      }
    };

    if (value instanceof Function) {
      setState((prev) => {
        const next = (value as (p: T) => T)(prev);
        if (next === prev) return prev;
        persist(next);
        return next;
      });
    } else {
      setState((prev) => {
        if (value === prev) return prev;
        persist(value);
        return value;
      });
    }
  };

  // Sync with cross-tab changes on web. Native secure storage has no
  // cross-tab concept.
  useEffect(() => {
    if (isNative) return;
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
  }, [key, isNative, deserialize]);

  return [state, setValue, ready] as const;
}
