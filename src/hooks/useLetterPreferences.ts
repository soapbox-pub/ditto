import { useCallback } from 'react';
import { useEncryptedSettings } from './useEncryptedSettings';
import type { LetterPreferences } from '@/lib/letterTypes';

/**
 * Persists per-user letter preferences in the encrypted settings event (NIP-78 kind 30078).
 * Returns the current preferences and an updater function.
 * When no user is logged in, returns empty defaults and a no-op updater.
 */
export function useLetterPreferences() {
  const { settings, updateSettings } = useEncryptedSettings();

  const prefs: LetterPreferences = settings?.letterPreferences ?? {};

  const updatePrefs = useCallback(
    (patch: Partial<LetterPreferences>) => {
      const current: LetterPreferences = settings?.letterPreferences ?? {};
      updateSettings.mutate({
        letterPreferences: { ...current, ...patch },
      });
    },
    [settings, updateSettings],
  );

  return { prefs, updatePrefs };
}
