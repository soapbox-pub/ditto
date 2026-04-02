import { useMemo } from 'react';
import { useEncryptedSettings } from './useEncryptedSettings';
import { useCurrentUser } from './useCurrentUser';
import { useAppContext } from './useAppContext';
import type { SavedFeed } from '@/contexts/AppContext';
import type { NostrEvent } from '@nostrify/nostrify';

/**
 * CRUD hook for saved feed tabs.
 * Saved feeds are stored in EncryptedSettings (NIP-78, kind 30078)
 * so they sync across devices, and mirrored in AppConfig (localStorage)
 * so they appear instantly on load before the encrypted query resolves.
 */
export function useSavedFeeds() {
  const { user } = useCurrentUser();
  const { config, updateConfig } = useAppContext();
  const { settings, updateSettings, isLoading } = useEncryptedSettings();

  // Use the encrypted settings value when available (authoritative),
  // fall back to the locally-cached AppConfig value for instant render.
  // While a mutation is in-flight, prefer config.savedFeeds which holds
  // the optimistic value — settings?.savedFeeds still reflects the old
  // server state until onSuccess fires and updates the query cache.
  const savedFeeds = useMemo<SavedFeed[]>(
    () => (updateSettings.isPending ? null : settings?.savedFeeds) ?? config.savedFeeds ?? [],
    [updateSettings.isPending, settings?.savedFeeds, config.savedFeeds],
  );

  /** Persist to both encrypted settings (cross-device) and local AppConfig (instant load).
   *  The local write is optimistic — it is rolled back if the remote write fails. */
  const persist = async (updated: SavedFeed[]) => {
    const previous = config.savedFeeds ?? [];
    // Optimistically update local cache for instant feedback
    updateConfig((c) => ({ ...c, savedFeeds: updated }));
    try {
      await updateSettings.mutateAsync({ savedFeeds: updated });
    } catch (err) {
      // Remote write failed — restore previous local state to stay in sync
      updateConfig((c) => ({ ...c, savedFeeds: previous }));
      throw err;
    }
  };

  /** Add a new saved feed from a spell event. Returns the created feed. */
  const addSavedFeed = async (label: string, spell: NostrEvent): Promise<SavedFeed> => {
    if (!user) throw new Error('Must be logged in to save feeds');

    const newFeed: SavedFeed = {
      id: crypto.randomUUID(),
      label: label.trim(),
      spell,
      createdAt: Date.now(),
    };

    await persist([...savedFeeds, newFeed]);
    return newFeed;
  };

  /** Remove a saved feed by id. */
  const removeSavedFeed = async (id: string): Promise<void> => {
    if (!user) throw new Error('Must be logged in to remove feeds');
    await persist(savedFeeds.filter((f) => f.id !== id));
  };

  /** Rename a saved feed. */
  const renameSavedFeed = async (id: string, label: string): Promise<void> => {
    if (!user) throw new Error('Must be logged in to rename feeds');
    await persist(savedFeeds.map((f) => f.id === id ? { ...f, label: label.trim() } : f));
  };

  /** Update a saved feed's label and/or spell. */
  const updateSavedFeed = async (id: string, changes: Partial<Pick<SavedFeed, 'label' | 'spell'>>): Promise<void> => {
    if (!user) throw new Error('Must be logged in to update feeds');
    await persist(savedFeeds.map((f) =>
      f.id === id ? { ...f, ...changes, label: (changes.label ?? f.label).trim() } : f,
    ));
  };

  return {
    savedFeeds,
    isLoading,
    addSavedFeed,
    removeSavedFeed,
    renameSavedFeed,
    updateSavedFeed,
    isPending: updateSettings.isPending,
  };
}
