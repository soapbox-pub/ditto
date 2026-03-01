import { type FeedSettings } from "@/contexts/AppContext";
import { useAppContext } from "@/hooks/useAppContext";
import { useEncryptedSettings } from "@/hooks/useEncryptedSettings";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { EXTRA_KINDS } from "@/lib/extraKinds";
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
  { id: 'theme', label: 'Vibe', path: '/settings/theme' },
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
 * `sidebarOrder` is the source of truth. Items present in the array
 * are shown; items absent are hidden. When sidebarOrder is empty
 * (fresh install), produces a default order of built-ins only.
 */
/** Set of all known extra-kind IDs with a sidebar page. */
const EXTRA_KIND_IDS = new Set(
  EXTRA_KINDS
    .filter((def) => def.showKey && def.route)
    .map((def) => def.id),
);

function computeOrderedItems(
  sidebarOrder: string[],
): string[] {
  // If sidebarOrder is empty (fresh install / migration), produce default order
  if (sidebarOrder.length === 0) {
    return BUILTIN_SIDEBAR_ITEMS.map((b) => b.id);
  }

  // sidebarOrder is the source of truth — keep items that are known
  // (either a built-in or a recognized extra-kind with a sidebar page).
  const ordered: string[] = [];
  const seen = new Set<string>();

  for (const item of sidebarOrder) {
    if (seen.has(item)) continue;
    seen.add(item);

    if (isBuiltinItem(item) || EXTRA_KIND_IDS.has(item)) {
      ordered.push(item);
    }
    // else: unknown entry — skip
  }

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

  // Hidden extra-kinds (not in sidebarOrder)
  for (const def of EXTRA_KINDS) {
    if (def.showKey && def.route && !visibleSet.has(def.id)) {
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
    /** Ordered list of visible sidebar item IDs (built-in + extra-kind). */
    orderedItems,
    /** Items available to add to the sidebar (hidden built-ins + disabled extra-kinds). */
    hiddenItems,
    /** Persist a new order for the sidebar. */
    updateSidebarOrder,
    /** Add an item to sidebar (append to order). */
    addToSidebar,
    /** Remove an item from sidebar (remove from order). */
    removeFromSidebar,
  };
}
