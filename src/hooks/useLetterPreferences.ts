import { useCallback } from 'react';
import { useEncryptedSettings } from './useEncryptedSettings';
import { useThemeStationery } from './useThemeStationery';
import type { LetterPreferences, Stationery } from '@/lib/letterTypes';

/**
 * Persists per-user letter preferences in the encrypted settings event (NIP-78 kind 30078).
 *
 * When no stationery preference has been explicitly saved, the user's active
 * Ditto theme is used as the default — so letters inherit their full theme
 * (colors, font, background image) automatically.
 */
export function useLetterPreferences() {
  const { settings, updateSettings } = useEncryptedSettings();
  const themeStationery = useThemeStationery();

  const savedPrefs: LetterPreferences = settings?.letterPreferences ?? {};

  // If no explicit stationery has been saved, fall back to the active theme.
  const effectiveStationery: Stationery =
    (savedPrefs.stationery as Stationery | undefined) ?? themeStationery;

  const prefs: LetterPreferences = {
    ...savedPrefs,
    // Expose the resolved stationery (theme fallback baked in) as the stationery field.
    // Consumers can check isThemeDefault to know if it came from the theme.
    stationery: effectiveStationery as Stationery & Record<string, unknown>,
  };

  /** True when no explicit stationery has been saved — the theme is the source. */
  const isThemeDefault = !savedPrefs.stationery;

  const updatePrefs = useCallback(
    (patch: Partial<LetterPreferences>) => {
      const current: LetterPreferences = settings?.letterPreferences ?? {};
      updateSettings.mutate({
        letterPreferences: { ...current, ...patch },
      });
    },
    [settings, updateSettings],
  );

  /** Reset stationery back to the active Ditto theme. */
  const resetStationery = useCallback(() => {
    const current: LetterPreferences = settings?.letterPreferences ?? {};
    const { stationery: _removed, ...rest } = current;
    updateSettings.mutate({ letterPreferences: rest });
  }, [settings, updateSettings]);

  return { prefs, updatePrefs, resetStationery, themeStationery, isThemeDefault };
}
