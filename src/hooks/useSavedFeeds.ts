import { useMemo } from 'react';
import { useEncryptedSettings } from './useEncryptedSettings';
import { useCurrentUser } from './useCurrentUser';
import type { SavedFeed, TabFilter, TabVarDef } from '@/contexts/AppContext';

/**
 * CRUD hook for saved feed tabs.
 * Saved feeds are stored in EncryptedSettings (NIP-78, kind 30078)
 * so they sync across devices.
 */
export function useSavedFeeds() {
  const { user } = useCurrentUser();
  const { settings, updateSettings, isLoading } = useEncryptedSettings();

  const savedFeeds = useMemo<SavedFeed[]>(
    () => settings?.savedFeeds ?? [],
    [settings?.savedFeeds],
  );

  /** Add a new saved feed. Returns the created feed. */
  const addSavedFeed = async (label: string, filter: TabFilter, vars: TabVarDef[], destination: SavedFeed['destination'] = 'feed'): Promise<SavedFeed> => {
    if (!user) throw new Error('Must be logged in to save feeds');

    const newFeed: SavedFeed = {
      id: crypto.randomUUID(),
      label: label.trim(),
      filter,
      vars,
      destination,
      createdAt: Date.now(),
    };

    const updated = [...savedFeeds, newFeed];
    await updateSettings.mutateAsync({ savedFeeds: updated });
    return newFeed;
  };

  /** Remove a saved feed by id. */
  const removeSavedFeed = async (id: string): Promise<void> => {
    if (!user) throw new Error('Must be logged in to remove feeds');
    const updated = savedFeeds.filter((f) => f.id !== id);
    await updateSettings.mutateAsync({ savedFeeds: updated });
  };

  /** Rename a saved feed. */
  const renameSavedFeed = async (id: string, label: string): Promise<void> => {
    if (!user) throw new Error('Must be logged in to rename feeds');
    const updated = savedFeeds.map((f) =>
      f.id === id ? { ...f, label: label.trim() } : f,
    );
    await updateSettings.mutateAsync({ savedFeeds: updated });
  };

  /** Update a saved feed's label and/or filter. */
  const updateSavedFeed = async (id: string, changes: Partial<Pick<SavedFeed, 'label' | 'filter' | 'vars'>>): Promise<void> => {
    if (!user) throw new Error('Must be logged in to update feeds');
    const updated = savedFeeds.map((f) =>
      f.id === id ? { ...f, ...changes, label: (changes.label ?? f.label).trim() } : f,
    );
    await updateSettings.mutateAsync({ savedFeeds: updated });
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
