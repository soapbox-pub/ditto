import { useEffect, useRef } from 'react';

import { useDebounce } from '@/hooks/useDebounce';

interface UseAutoDetectModelsOptions {
  /** The API key string; user edits to it are what schedule the debounce. */
  apiKey: string;
  /** The base URL string; a change to it alone never triggers detection. */
  baseURL: string;
  /**
   * True once the user has edited the apiKey field (typing or paste).
   * The dialog re-seeding the form (opening for add/edit) is not an edit, so
   * the gate prevents a spurious fetch just from opening the dialog.
   */
  userEdited: boolean;
  /** Debounce delay in ms after the last apiKey change. */
  delay?: number;
  /** Called once the debounce settles and both fields are non-empty. */
  onDetect: () => void;
}

/**
 * Debounced auto-detect trigger for provider profiles: calls onDetect roughly
 * `delay` ms after the last user edit to apiKey, and only while both apiKey and
 * baseURL are non-empty. The effect depends solely on the debounced apiKey, so
 * baseURL-only and unrelated changes never schedule a call. The callback,
 * baseURL, and userEdited gate are read through refs so re-renders that change
 * them (an unrelated field edit, a baseURL change) do not re-trigger the
 * effect.
 */
export function useAutoDetectModels({ apiKey, baseURL, userEdited, delay = 700, onDetect }: UseAutoDetectModelsOptions): void {
  const onDetectRef = useRef(onDetect);
  useEffect(() => {
    onDetectRef.current = onDetect;
  }, [onDetect]);

  const baseURLRef = useRef(baseURL);
  useEffect(() => {
    baseURLRef.current = baseURL;
  }, [baseURL]);

  const userEditedRef = useRef(userEdited);
  useEffect(() => {
    userEditedRef.current = userEdited;
  }, [userEdited]);

  const debouncedApiKey = useDebounce(apiKey, delay);

  // Mounting with a pre-filled apiKey is not an edit, so the first effect run
  // only arms the trigger instead of firing.
  const initializedRef = useRef(false);

  useEffect(() => {
    if (!initializedRef.current) {
      initializedRef.current = true;
      return;
    }
    if (!userEditedRef.current) return;
    if (!debouncedApiKey.trim() || !baseURLRef.current.trim()) return;
    onDetectRef.current();
  }, [debouncedApiKey]);
}
