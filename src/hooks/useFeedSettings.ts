import { type FeedSettings } from "@/contexts/AppContext";
import { useAppContext } from "@/hooks/useAppContext";
import { EXTRA_KINDS } from "@/lib/extraKinds";
import { useCallback, useMemo } from "react";

/**
 * Compute the ordered list of visible content-type routes.
 * Uses the persisted `sidebarOrder` for items that are still enabled,
 * then appends any newly-enabled items not yet in the order array.
 */
function computeOrderedRoutes(
  feedSettings: FeedSettings,
  sidebarOrder: string[],
): string[] {
  // All currently enabled routes
  const enabledRoutes = new Set(
    EXTRA_KINDS
      .filter((def) => def.showKey && def.route && feedSettings[def.showKey])
      .map((def) => def.route!),
  );

  // Start with persisted order, keeping only still-enabled items
  const ordered: string[] = [];
  for (const route of sidebarOrder) {
    if (enabledRoutes.has(route)) {
      ordered.push(route);
      enabledRoutes.delete(route);
    }
  }

  // Append any enabled items not yet in the persisted order
  // (preserves their default order from EXTRA_KINDS)
  for (const def of EXTRA_KINDS) {
    if (def.route && enabledRoutes.has(def.route)) {
      ordered.push(def.route);
    }
  }

  return ordered;
}

/**
 * Hook to get and update feed settings (sidebar links + feed kind inclusion)
 * and manage sidebar order.
 */
export function useFeedSettings() {
  const { config, updateConfig } = useAppContext();

  const orderedRoutes = useMemo(
    () => computeOrderedRoutes(config.feedSettings, config.sidebarOrder),
    [config.feedSettings, config.sidebarOrder],
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
    },
    [updateConfig],
  );

  /** Add a content-type to the sidebar (enables it and appends to order). */
  const addToSidebar = useCallback(
    (route: string) => {
      const def = EXTRA_KINDS.find((d) => d.route === route);
      if (!def?.showKey) return;

      updateConfig((currentConfig) => {
        const currentOrder = currentConfig.sidebarOrder ?? config.sidebarOrder;
        return {
          ...currentConfig,
          feedSettings: {
            ...config.feedSettings,
            ...currentConfig.feedSettings,
            [def.showKey!]: true,
          },
          sidebarOrder: currentOrder.includes(route)
            ? currentOrder
            : [...currentOrder, route],
        };
      });
    },
    [config.feedSettings, config.sidebarOrder, updateConfig],
  );

  /** Remove a content-type from the sidebar (disables it and removes from order). */
  const removeFromSidebar = useCallback(
    (route: string) => {
      const def = EXTRA_KINDS.find((d) => d.route === route);
      if (!def?.showKey) return;

      updateConfig((currentConfig) => {
        const currentOrder = currentConfig.sidebarOrder ?? config.sidebarOrder;
        return {
          ...currentConfig,
          feedSettings: {
            ...config.feedSettings,
            ...currentConfig.feedSettings,
            [def.showKey!]: false,
          },
          sidebarOrder: currentOrder.filter((r) => r !== route),
        };
      });
    },
    [config.feedSettings, config.sidebarOrder, updateConfig],
  );

  return {
    feedSettings: config.feedSettings,
    updateFeedSettings,
    /** Ordered list of visible content-type route names. */
    orderedRoutes,
    /** Persist a new order for the sidebar Explore section. */
    updateSidebarOrder,
    /** Add a content-type to sidebar (enable + append to order). */
    addToSidebar,
    /** Remove a content-type from sidebar (disable + remove from order). */
    removeFromSidebar,
  };
}
