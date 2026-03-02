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

  const addColumn = useCallback((type: string, params?: Record<string, string>) => {
    const col: DeckColumnConfig = { id: genColumnId(), type, ...(params && { params }) };
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

  /** Scroll to an existing column of the given type (+ params), or add one and scroll to it. */
  const openColumn = useCallback((type: string, params?: Record<string, string>) => {
    // Build a selector that matches both type and optional param key
    const paramKey = params ? Object.entries(params).map(([k, v]) => `[data-deck-param-${CSS.escape(k)}="${CSS.escape(v)}"]`).join('') : '';
    const selector = `[data-deck-column-type="${CSS.escape(type)}"]${paramKey}`;
    const existing = document.querySelector(selector);
    if (existing) {
      existing.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' });
      return;
    }
    addColumn(type, params);
    // Scroll to the new column after React commits the DOM update
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const el = document.querySelector(selector);
        el?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' });
      });
    });
  }, [addColumn]);

  return { deckMode, deckColumns, toggleDeckMode, addColumn, removeColumn, reorderColumns, openColumn };
}
