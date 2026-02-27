import { type FeedSettings } from "@/contexts/AppContext";
import { useAppContext } from "@/hooks/useAppContext";
import { EXTRA_KINDS, getExtraKindDef } from "@/lib/extraKinds";
import { useCallback, useMemo } from "react";

// ── Built-in sidebar items ────────────────────────────────────────────────────

/** Definition for a built-in sidebar item (not backed by EXTRA_KINDS). */
export interface BuiltinSidebarItem {
  /** Unique identifier stored in sidebarOrder. */
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
  { id: 'feed', label: 'Feed', path: '/' },
  { id: 'notifications', label: 'Notifications', path: '/notifications', requiresAuth: true },
  { id: 'search', label: 'Search', path: '/search' },
  { id: 'trends', label: 'Trends', path: '/trends' },
  { id: 'bookmarks', label: 'Bookmarks', path: '/bookmarks', requiresAuth: true },
  { id: 'profile', label: 'Profile', path: '/profile', requiresAuth: true },
  { id: 'settings', label: 'Settings', path: '/settings' },
  { id: 'theme', label: 'Theme', path: '/settings/theme' },
  { id: 'themes', label: 'Themes', path: '/themes' },
];

/** Set of all built-in IDs for quick lookup. */
const BUILTIN_IDS = new Set(BUILTIN_SIDEBAR_ITEMS.map((b) => b.id));

/** Check if a sidebar order entry is a built-in item. */
export function isBuiltinItem(id: string): boolean {
  return BUILTIN_IDS.has(id);
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
 * - A built-in ID like `"feed"` or `"trends"`
 * - An extra-kind ID like `"vines"` or `"streams"`
 *
 * Uses the persisted `sidebarOrder` for items that are still enabled,
 * then appends any newly-enabled items not yet in the order array.
 * When sidebarOrder is empty (fresh install), produces a default order
 * starting with built-ins, then enabled EXTRA_KINDS.
 */
function computeOrderedItems(
  feedSettings: FeedSettings,
  sidebarOrder: string[],
): string[] {
  // All currently enabled extra-kind IDs (only those with a sidebar page)
  const enabledExtraIds = new Set(
    EXTRA_KINDS
      .filter((def) => def.showKey && def.route && feedSettings[def.showKey])
      .map((def) => def.id),
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
    // Then enabled extra-kinds in definition order
    for (const def of EXTRA_KINDS) {
      if (def.route && enabledExtraIds.has(def.id)) {
        result.push(def.id);
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
    } else if (enabledExtraIds.has(item)) {
      // Extra-kind: valid if still enabled
      ordered.push(item);
      enabledExtraIds.delete(item);
    }
    // else: stale entry (kind was disabled or unknown) — skip
  }

  // Append any newly-enabled extra-kind items not in persisted order
  for (const def of EXTRA_KINDS) {
    if (def.route && enabledExtraIds.has(def.id)) {
      ordered.push(def.id);
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
  _sidebarOrder: string[],
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
      hidden.push({ id: def.id, label: def.label, builtin: false });
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

  /**
   * Get the effective sidebar order, using the computed default when the
   * persisted order is empty (fresh install).
   */
  /**
   * Get the effective sidebar order, using the computed default when the
   * persisted order is empty or undefined (fresh install).
   */
  const getEffectiveOrder = useCallback(
    (persisted: string[] | undefined) => persisted?.length ? persisted : orderedItems,
    [orderedItems],
  );

  /** Add an item to the sidebar (handles both built-ins and extra-kinds). */
  const addToSidebar = useCallback(
    (id: string) => {
      if (isBuiltinItem(id)) {
        // Built-in: just add to order (no feedSettings toggle)
        updateConfig((currentConfig) => {
          const currentOrder = getEffectiveOrder(currentConfig.sidebarOrder);
          if (currentOrder.includes(id)) return currentConfig;
          return {
            ...currentConfig,
            sidebarOrder: [...currentOrder, id],
          };
        });
      } else {
        // Extra-kind: enable via feedSettings + add to order
        const def = getExtraKindDef(id);
        if (!def?.showKey) return;

        updateConfig((currentConfig) => {
          const currentOrder = getEffectiveOrder(currentConfig.sidebarOrder);
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
    [config.feedSettings, getEffectiveOrder, updateConfig],
  );

  /** Remove an item from the sidebar (handles both built-ins and extra-kinds). */
  const removeFromSidebar = useCallback(
    (id: string) => {
      if (isBuiltinItem(id)) {
        // Built-in: just remove from order
        updateConfig((currentConfig) => {
          const currentOrder = getEffectiveOrder(currentConfig.sidebarOrder);
          return {
            ...currentConfig,
            sidebarOrder: currentOrder.filter((r) => r !== id),
          };
        });
      } else {
        // Extra-kind: disable via feedSettings + remove from order
        const def = getExtraKindDef(id);
        if (!def?.showKey) return;

        updateConfig((currentConfig) => {
          const currentOrder = getEffectiveOrder(currentConfig.sidebarOrder);
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
    [config.feedSettings, getEffectiveOrder, updateConfig],
  );

  return {
    feedSettings: config.feedSettings,
    updateFeedSettings,
    /** Ordered list of visible sidebar item IDs (built-in + extra-kind). */
    orderedItems,
    /** Items available to add to the sidebar (hidden built-ins + disabled extra-kinds). */
    hiddenItems,
    /** Persist a new order for the sidebar. */
    updateSidebarOrder,
    /** Add an item to sidebar (enable + append to order). */
    addToSidebar,
    /** Remove an item from sidebar (disable + remove from order). */
    removeFromSidebar,
  };
}
