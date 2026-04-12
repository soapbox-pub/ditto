import { useMemo, useCallback } from 'react';
import { MORE_SEPARATOR_ID } from '@/components/SidebarNavItem';
import type { HiddenSidebarItem } from '@/hooks/useFeedSettings';

/**
 * Shared sidebar editing logic used by both LeftSidebar and MobileDrawer.
 *
 * Builds the combined editing list (visible + __more__ separator + hidden)
 * and provides handlers for reordering and removing items.
 */
export function useSidebarEditing({
  editing,
  items,
  hiddenItems,
  updateSidebarOrder,
  removeFromSidebar,
}: {
  editing: boolean;
  /** Visible sidebar item IDs (may be pre-filtered, e.g. MobileDrawer strips leading dividers). */
  items: string[];
  hiddenItems: HiddenSidebarItem[];
  updateSidebarOrder: (newOrder: string[]) => void;
  removeFromSidebar: (id: string, index?: number) => void;
}) {
  /** Combined list for the drag-and-drop editor: visible items + separator + hidden items. */
  const editingItems = useMemo(() => {
    if (!editing) return [];
    return [...items, MORE_SEPARATOR_ID, ...hiddenItems.map((h) => h.id)];
  }, [editing, items, hiddenItems]);

  /** Handle drag-and-drop reorder — extract items above the __more__ separator. */
  const handleEditReorder = useCallback((newOrder: string[]) => {
    const moreIdx = newOrder.indexOf(MORE_SEPARATOR_ID);
    if (moreIdx === -1) return;
    const newVisible = newOrder.slice(0, moreIdx);
    updateSidebarOrder(newVisible);
  }, [updateSidebarOrder]);

  /** Remove a sidebar item; dividers require an index to identify which one. */
  const handleEditRemove = useCallback((id: string, index?: number) => {
    if (id === 'divider' && index !== undefined) {
      removeFromSidebar(id, index);
    } else {
      removeFromSidebar(id);
    }
  }, [removeFromSidebar]);

  return { editingItems, handleEditReorder, handleEditRemove };
}
