import { useCallback } from 'react';
import { useEncryptedSettings } from './useEncryptedSettings';
import type { LetterPreferences } from '@/lib/letterTypes';

/**
 * Persists per-user letter preferences in the encrypted settings event (NIP-78 kind 30078).
 *
 * `isThemeDefault` is true when no stationery has been explicitly saved — callers
 * should use `useThemeStationery()` as the live preview source in that case.
 */
export function useLetterPreferences() {
  const { settings, updateSettings } = useEncryptedSettings();

  // Raw saved prefs — stationery may be undefined if never set
  const prefs: LetterPreferences = settings?.letterPreferences ?? {};

  /** True when no stationery has been explicitly saved — use the active Ditto theme. */
  const isThemeDefault = !prefs.stationery;

  const updatePrefs = useCallback(
    (patch: Partial<LetterPreferences>) => {
      const current: LetterPreferences = settings?.letterPreferences ?? {};
      updateSettings.mutate({ letterPreferences: { ...current, ...patch } });
    },
    [settings, updateSettings],
  );

  /** Remove the saved stationery, reverting to the active Ditto theme. */
  const resetStationery = useCallback(() => {
    const current: LetterPreferences = settings?.letterPreferences ?? {};
    const { stationery: _removed, ...rest } = current;
    updateSettings.mutate({ letterPreferences: rest });
  }, [settings, updateSettings]);

  return { prefs, updatePrefs, resetStationery, isThemeDefault };
}
