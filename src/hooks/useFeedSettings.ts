import { type FeedSettings } from "@/contexts/AppContext";
import { useAppContext } from "@/hooks/useAppContext";
import { useEncryptedSettings } from "@/hooks/useEncryptedSettings";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { SIDEBAR_ITEMS, SIDEBAR_ITEM_IDS } from "@/lib/sidebarItems";
import { useCallback, useMemo } from "react";

// ── Order computation ─────────────────────────────────────────────────────────

/** Default sidebar order for fresh installs (system pages only). */
const DEFAULT_SIDEBAR_ORDER = SIDEBAR_ITEMS
  .filter((s) => ['feed', 'notifications', 'search', 'trends', 'bookmarks', 'profile', 'settings', 'theme'].includes(s.id))
  .map((s) => s.id);

/**
 * Compute the ordered list of visible sidebar items.
 *
 * `sidebarOrder` is the source of truth. Items present in the array
 * are shown; items absent are hidden. Unknown IDs are silently dropped.
 * When sidebarOrder is empty (fresh install), produces a default order.
 */
function computeOrderedItems(
  sidebarOrder: string[],
): string[] {
  if (sidebarOrder.length === 0) {
    return DEFAULT_SIDEBAR_ORDER;
  }

  const ordered: string[] = [];
  const seen = new Set<string>();

  for (const item of sidebarOrder) {
    if (seen.has(item)) continue;
    seen.add(item);

    if (SIDEBAR_ITEM_IDS.has(item)) {
      ordered.push(item);
    }
    // else: unknown entry — skip
  }

  return ordered;
}

/**
 * Compute the list of items available to add to the sidebar.
 * Returns sidebar items not currently in the ordered list.
 */
export interface HiddenSidebarItem {
  /** Identifier to pass to addToSidebar. */
  id: string;
  /** Display label. */
  label: string;
}

function computeHiddenItems(
  orderedItems: string[],
): HiddenSidebarItem[] {
  const visibleSet = new Set(orderedItems);
  const hidden: HiddenSidebarItem[] = [];

  for (const item of SIDEBAR_ITEMS) {
    if (!visibleSet.has(item.id)) {
      hidden.push({ id: item.id, label: item.label });
    }
  }

  return hidden;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

/**
 * Hook to get and update feed settings and manage sidebar order.
 */
export function useFeedSettings() {
  const { config, updateConfig } = useAppContext();
  const { updateSettings } = useEncryptedSettings();
  const { user } = useCurrentUser();

  const orderedItems = useMemo(
    () => computeOrderedItems(config.sidebarOrder),
    [config.sidebarOrder],
  );

  const hiddenItems = useMemo(
    () => computeHiddenItems(orderedItems),
    [orderedItems],
  );

  const updateFeedSettings = useCallback(
    (patch: Partial<FeedSettings>) => {
      updateConfig((currentConfig) => ({
        ...currentConfig,
        feedSettings: {
          ...config.feedSettings,
          ...currentConfig.feedSettings,
          ...patch,
        },
      }));
    },
    [config.feedSettings, updateConfig],
  );

  const updateSidebarOrder = useCallback(
    (newOrder: string[]) => {
      updateConfig((currentConfig) => ({
        ...currentConfig,
        sidebarOrder: newOrder,
      }));
      if (user) {
        updateSettings.mutateAsync({ sidebarOrder: newOrder }).catch(() => {});
      }
    },
    [updateConfig, updateSettings, user],
  );

  /**
   * Get the effective sidebar order, using the computed default when the
   * persisted order is empty or undefined (fresh install).
   */
  const getEffectiveOrder = useCallback(
    (persisted: string[] | undefined) => persisted?.length ? persisted : orderedItems,
    [orderedItems],
  );

  /** Add an item to the sidebar (append to sidebarOrder). */
  const addToSidebar = useCallback(
    (id: string) => {
      updateConfig((currentConfig) => {
        const currentOrder = getEffectiveOrder(currentConfig.sidebarOrder);
        if (currentOrder.includes(id)) return currentConfig;
        const newOrder = [...currentOrder, id];
        if (user) {
          updateSettings.mutateAsync({ sidebarOrder: newOrder }).catch(() => {});
        }
        return {
          ...currentConfig,
          sidebarOrder: newOrder,
        };
      });
    },
    [getEffectiveOrder, updateConfig, updateSettings, user],
  );

  /** Remove an item from the sidebar (remove from sidebarOrder). */
  const removeFromSidebar = useCallback(
    (id: string) => {
      updateConfig((currentConfig) => {
        const currentOrder = getEffectiveOrder(currentConfig.sidebarOrder);
        const newOrder = currentOrder.filter((r) => r !== id);
        if (user) {
          updateSettings.mutateAsync({ sidebarOrder: newOrder }).catch(() => {});
        }
        return {
          ...currentConfig,
          sidebarOrder: newOrder,
        };
      });
    },
    [getEffectiveOrder, updateConfig, updateSettings, user],
  );

  return {
    feedSettings: config.feedSettings,
    updateFeedSettings,
    /** Ordered list of visible sidebar item IDs. */
    orderedItems,
    /** Items available to add to the sidebar. */
    hiddenItems,
    /** Persist a new order for the sidebar. */
    updateSidebarOrder,
    /** Add an item to sidebar (append to order). */
    addToSidebar,
    /** Remove an item from sidebar (remove from order). */
    removeFromSidebar,
  };
}
