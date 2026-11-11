import { useCallback, useState } from 'react';
import { useLocation } from 'react-router-dom';

/** How many values to remember across all history entries. */
const MAX_ENTRIES = 200;

const entries = new Map<string, unknown>();

/**
 * `useState` that belongs to the history entry rather than the mounted page:
 * going back to the entry finds the value as it was left. For what a page
 * would show differently on return if it started over, such as its selected
 * tab, without which the restored scroll lands in the wrong list.
 *
 * `name` tells apart the values of one page. Memory only, so a reload starts
 * over, as the page itself does.
 */
export function useEntryState<T>(name: string, initial: T): [T, (value: T) => void] {
  const { key } = useLocation();
  const id = `${key}:${name}`;
  const [state, setState] = useState<T>(() => (entries.has(id) ? (entries.get(id) as T) : initial));

  const set = useCallback((value: T) => {
    // Re-insert so the map stays ordered oldest-first.
    entries.delete(id);
    entries.set(id, value);
    if (entries.size > MAX_ENTRIES) {
      const oldest = entries.keys().next().value;
      if (oldest !== undefined) entries.delete(oldest);
    }
    setState(value);
  }, [id]);

  return [state, set];
}
