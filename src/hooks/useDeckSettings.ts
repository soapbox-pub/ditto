import { useCallback } from 'react';
import { useAppContext } from '@/hooks/useAppContext';
import type { DeckColumnConfig } from '@/contexts/AppContext';

let _nextId = 0;

/** Generate a unique column ID. */
function genColumnId(): string {
  return `col_${Date.now().toString(36)}_${(++_nextId).toString(36)}`;
}

/** Hook for reading and updating deck layout settings. */
export function useDeckSettings() {
  const { config, updateConfig } = useAppContext();

  const deckMode = config.deckMode;
  const deckColumns = config.deckColumns;

  const toggleDeckMode = useCallback(() => {
    updateConfig((c) => ({ ...c, deckMode: !c.deckMode }));
  }, [updateConfig]);

  const addColumn = useCallback((type: string) => {
    const col: DeckColumnConfig = { id: genColumnId(), type };
    updateConfig((c) => ({ ...c, deckColumns: [...(c.deckColumns ?? []), col] }));
  }, [updateConfig]);

  const removeColumn = useCallback((id: string) => {
    updateConfig((c) => ({
      ...c,
      deckColumns: (c.deckColumns ?? []).filter((col) => col.id !== id),
    }));
  }, [updateConfig]);

  const reorderColumns = useCallback((newOrder: DeckColumnConfig[]) => {
    updateConfig((c) => ({ ...c, deckColumns: newOrder }));
  }, [updateConfig]);

  return { deckMode, deckColumns, toggleDeckMode, addColumn, removeColumn, reorderColumns };
}
