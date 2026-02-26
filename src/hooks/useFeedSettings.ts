import { type FeedSettings } from "@/contexts/AppContext";
import { useAppContext } from "@/hooks/useAppContext";
import { EXTRA_KINDS } from "@/lib/extraKinds";
import { useCallback, useMemo } from "react";

// ── Built-in sidebar items ────────────────────────────────────────────────────

/** Identifier prefix for built-in sidebar items (not backed by EXTRA_KINDS). */
const BUILTIN_PREFIX = '__';

/** Definition for a built-in sidebar item. */
export interface BuiltinSidebarItem {
  /** Identifier stored in sidebarOrder (e.g. "__feed"). */
  id: string;
  /** Display label. */
  label: string;
  /** Navigation path. */
  path: string;
  /** If true, only shown when a user is logged in. */
  requiresAuth?: boolean;
}

/** All available built-in sidebar items, in default display order. */
export const BUILTIN_SIDEBAR_ITEMS: BuiltinSidebarItem[] = [
  { id: '__feed', label: 'Feed', path: '/' },
  { id: '__notifications', label: 'Notifications', path: '/notifications', requiresAuth: true },
  { id: '__trends', label: 'Trends', path: '/search?tab=trends' },
  { id: '__bookmarks', label: 'Bookmarks', path: '/bookmarks', requiresAuth: true },
  { id: '__profile', label: 'Profile', path: '/profile', requiresAuth: true },
  { id: '__settings', label: 'Settings', path: '/settings' },
];

/** Set of all built-in IDs for quick lookup. */
const BUILTIN_IDS = new Set(BUILTIN_SIDEBAR_ITEMS.map((b) => b.id));

/** Check if a sidebar order entry is a built-in item. */
export function isBuiltinItem(id: string): boolean {
  return id.startsWith(BUILTIN_PREFIX) && BUILTIN_IDS.has(id);
}

/** Get the built-in definition for an ID, or undefined. */
export function getBuiltinItem(id: string): BuiltinSidebarItem | undefined {
  return BUILTIN_SIDEBAR_ITEMS.find((b) => b.id === id);
}

// ── Order computation ─────────────────────────────────────────────────────────

/**
 * Compute the ordered list of visible sidebar items.
 *
 * Each entry is either:
 * - A built-in ID like `"__feed"` or `"__trends"`
 * - A route string from EXTRA_KINDS like `"vines"` or `"streams"`
 *
 * Uses the persisted `sidebarOrder` for items that are still enabled,
 * then appends any newly-enabled items not yet in the order array.
 * When sidebarOrder is empty (fresh install), produces a default order
 * starting with built-ins, then enabled EXTRA_KINDS routes.
 */
function computeOrderedItems(
  feedSettings: FeedSettings,
  sidebarOrder: string[],
): string[] {
  // All currently enabled extra-kind routes
  const enabledRoutes = new Set(
    EXTRA_KINDS
      .filter((def) => def.showKey && def.route && feedSettings[def.showKey])
      .map((def) => def.route!),
  );

  // All built-in IDs (always "available" — visible when present in order)
  const builtinIds = new Set(BUILTIN_SIDEBAR_ITEMS.map((b) => b.id));

  // If sidebarOrder is empty (fresh install / migration), produce default order
  if (sidebarOrder.length === 0) {
    const result: string[] = [];
    // Built-ins first
    for (const b of BUILTIN_SIDEBAR_ITEMS) {
      result.push(b.id);
    }
    // Then enabled extra-kind routes in EXTRA_KINDS definition order
    for (const def of EXTRA_KINDS) {
      if (def.route && enabledRoutes.has(def.route)) {
        result.push(def.route);
      }
    }
    return result;
  }

  // Start with persisted order, keeping only still-valid items
  const ordered: string[] = [];
  const seen = new Set<string>();

  for (const item of sidebarOrder) {
    if (seen.has(item)) continue;
    seen.add(item);

    if (isBuiltinItem(item)) {
      // Built-in: always valid if in order
      ordered.push(item);
      builtinIds.delete(item);
    } else if (enabledRoutes.has(item)) {
      // Extra-kind: valid if still enabled
      ordered.push(item);
      enabledRoutes.delete(item);
    }
    // else: stale entry (kind was disabled or unknown) — skip
  }

  // Append any newly-enabled extra-kind items not in persisted order
  for (const def of EXTRA_KINDS) {
    if (def.route && enabledRoutes.has(def.route)) {
      ordered.push(def.route);
    }
  }

  // Do NOT auto-append missing built-ins when a persisted order exists.
  // If a built-in is missing from sidebarOrder, the user removed it.
  // New built-ins will appear in the "add" menu instead of being forced into the sidebar.

  return ordered;
}

/**
 * Compute the list of items available to add to the sidebar.
 * Returns both hidden extra-kind definitions and hidden built-in items.
 */
export interface HiddenSidebarItem {
  /** Identifier to pass to addToSidebar. */
  id: string;
  /** Display label. */
  label: string;
  /** Whether this is a built-in item. */
  builtin: boolean;
}

function computeHiddenItems(
  feedSettings: FeedSettings,
  sidebarOrder: string[],
  orderedItems: string[],
): HiddenSidebarItem[] {
  const visibleSet = new Set(orderedItems);
  const hidden: HiddenSidebarItem[] = [];

  // Hidden built-ins (removed by user)
  for (const b of BUILTIN_SIDEBAR_ITEMS) {
    if (!visibleSet.has(b.id)) {
      hidden.push({ id: b.id, label: b.label, builtin: true });
    }
  }

  // Hidden extra-kinds (disabled via feedSettings)
  for (const def of EXTRA_KINDS) {
    if (def.showKey && def.route && !feedSettings[def.showKey]) {
      hidden.push({ id: def.route, label: def.label, builtin: false });
    }
  }

  return hidden;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

/**
 * Hook to get and update feed settings (sidebar links + feed kind inclusion)
 * and manage sidebar order including built-in items.
 */
export function useFeedSettings() {
  const { config, updateConfig } = useAppContext();

  const orderedItems = useMemo(
    () => computeOrderedItems(config.feedSettings, config.sidebarOrder),
    [config.feedSettings, config.sidebarOrder],
  );

  const hiddenItems = useMemo(
    () => computeHiddenItems(config.feedSettings, config.sidebarOrder, orderedItems),
    [config.feedSettings, config.sidebarOrder, orderedItems],
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

  /** Add an item to the sidebar (handles both built-ins and extra-kinds). */
  const addToSidebar = useCallback(
    (id: string) => {
      if (isBuiltinItem(id)) {
        // Built-in: just add to order (no feedSettings toggle)
        updateConfig((currentConfig) => {
          const currentOrder = currentConfig.sidebarOrder ?? config.sidebarOrder;
          if (currentOrder.includes(id)) return currentConfig;
          return {
            ...currentConfig,
            sidebarOrder: [...currentOrder, id],
          };
        });
      } else {
        // Extra-kind: enable via feedSettings + add to order
        const def = EXTRA_KINDS.find((d) => d.route === id);
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
            sidebarOrder: currentOrder.includes(id)
              ? currentOrder
              : [...currentOrder, id],
          };
        });
      }
    },
    [config.feedSettings, config.sidebarOrder, updateConfig],
  );

  /** Remove an item from the sidebar (handles both built-ins and extra-kinds). */
  const removeFromSidebar = useCallback(
    (id: string) => {
      if (isBuiltinItem(id)) {
        // Built-in: just remove from order
        updateConfig((currentConfig) => {
          const currentOrder = currentConfig.sidebarOrder ?? config.sidebarOrder;
          return {
            ...currentConfig,
            sidebarOrder: currentOrder.filter((r) => r !== id),
          };
        });
      } else {
        // Extra-kind: disable via feedSettings + remove from order
        const def = EXTRA_KINDS.find((d) => d.route === id);
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
            sidebarOrder: currentOrder.filter((r) => r !== id),
          };
        });
      }
    },
    [config.feedSettings, config.sidebarOrder, updateConfig],
  );

  return {
    feedSettings: config.feedSettings,
    updateFeedSettings,
    /** Ordered list of visible sidebar item IDs (built-in IDs + extra-kind routes). */
    orderedItems,
    /** Items available to add to the sidebar (hidden built-ins + disabled extra-kinds). */
    hiddenItems,
    /** Persist a new order for the sidebar Explore section. */
    updateSidebarOrder,
    /** Add an item to sidebar (enable + append to order). */
    addToSidebar,
    /** Remove an item from sidebar (disable + remove from order). */
    removeFromSidebar,
  };
}
