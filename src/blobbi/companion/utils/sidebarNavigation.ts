/**
 * Sidebar Navigation Utilities
 * 
 * Maps routes to sidebar positions to determine entry animation direction.
 * Used by the companion entry system to decide if Blobbi should fall from
 * above or rise from below based on navigation direction.
 */

import { SIDEBAR_ITEMS, getSidebarItem, isSidebarDivider } from '@/lib/sidebarItems';

/**
 * Direction of navigation relative to sidebar order.
 * - 'down': Moving to a page lower in the sidebar (destination index > current index)
 * - 'up': Moving to a page higher in the sidebar (destination index < current index)
 * - 'same': Staying on the same page or indices are equal
 * - 'unknown': One or both pages are not in the sidebar
 */
export type NavigationDirection = 'down' | 'up' | 'same' | 'unknown';

/**
 * Result of comparing two routes in the sidebar order.
 */
export interface NavigationComparison {
  /** Direction of navigation */
  direction: NavigationDirection;
  /** Index of the source route in sidebar order (-1 if not found) */
  fromIndex: number;
  /** Index of the destination route in sidebar order (-1 if not found) */
  toIndex: number;
}

/**
 * Build a map from route paths to sidebar item IDs.
 * This handles the path -> id mapping for quick lookup.
 */
function buildPathToIdMap(): Map<string, string> {
  const map = new Map<string, string>();
  
  for (const item of SIDEBAR_ITEMS) {
    // Map the path to the item ID
    map.set(item.path, item.id);
    
    // Also handle paths without leading slash
    if (item.path.startsWith('/')) {
      map.set(item.path.slice(1), item.id);
    }
  }
  
  // Special cases
  map.set('/', 'feed'); // Root maps to feed (homepage)
  
  return map;
}

const PATH_TO_ID_MAP = buildPathToIdMap();

/**
 * Get the sidebar item ID for a given route path.
 * Returns undefined if the path doesn't correspond to a sidebar item.
 * 
 * @param pathname - The route pathname (e.g., '/notifications', '/feed')
 */
export function getSidebarIdForPath(pathname: string): string | undefined {
  // Direct lookup
  if (PATH_TO_ID_MAP.has(pathname)) {
    return PATH_TO_ID_MAP.get(pathname);
  }
  
  // Try without leading slash
  const withoutSlash = pathname.startsWith('/') ? pathname.slice(1) : pathname;
  if (PATH_TO_ID_MAP.has(withoutSlash)) {
    return PATH_TO_ID_MAP.get(withoutSlash);
  }
  
  // Check if it matches any sidebar item's path
  for (const item of SIDEBAR_ITEMS) {
    if (item.path === pathname || item.path === `/${withoutSlash}`) {
      return item.id;
    }
  }
  
  return undefined;
}

/**
 * Find the index of a sidebar item ID in the ordered items array.
 * Skips dividers when calculating the index.
 * 
 * @param itemId - The sidebar item ID to find
 * @param orderedItems - The current sidebar order (from useFeedSettings)
 * @returns The index (0-based) or -1 if not found
 */
export function getSidebarIndex(itemId: string, orderedItems: string[]): number {
  // Filter out dividers and find the index
  const itemsWithoutDividers = orderedItems.filter(id => !isSidebarDivider(id));
  return itemsWithoutDividers.indexOf(itemId);
}

/**
 * Compare two routes and determine the navigation direction.
 * 
 * This is the main function used by the entry animation system to decide
 * whether Blobbi should fall from above or rise from below.
 * 
 * @param fromPath - The source route pathname
 * @param toPath - The destination route pathname  
 * @param orderedItems - The current sidebar order (from useFeedSettings)
 * @returns Navigation comparison result
 */
export function compareRoutes(
  fromPath: string,
  toPath: string,
  orderedItems: string[]
): NavigationComparison {
  // Get sidebar IDs for both paths
  const fromId = getSidebarIdForPath(fromPath);
  const toId = getSidebarIdForPath(toPath);
  
  // If either path isn't in the sidebar, we can't determine direction
  if (!fromId || !toId) {
    return {
      direction: 'unknown',
      fromIndex: fromId ? getSidebarIndex(fromId, orderedItems) : -1,
      toIndex: toId ? getSidebarIndex(toId, orderedItems) : -1,
    };
  }
  
  // Get indices in the current sidebar order
  const fromIndex = getSidebarIndex(fromId, orderedItems);
  const toIndex = getSidebarIndex(toId, orderedItems);
  
  // If either item isn't in the current sidebar order, direction is unknown
  if (fromIndex === -1 || toIndex === -1) {
    return {
      direction: 'unknown',
      fromIndex,
      toIndex,
    };
  }
  
  // Compare indices to determine direction
  let direction: NavigationDirection;
  if (toIndex > fromIndex) {
    direction = 'down'; // Moving to a page lower in the sidebar
  } else if (toIndex < fromIndex) {
    direction = 'up'; // Moving to a page higher in the sidebar
  } else {
    direction = 'same';
  }
  
  return {
    direction,
    fromIndex,
    toIndex,
  };
}

/**
 * Determine the entry direction for a route change.
 * 
 * This is a simplified version that returns the entry type:
 * - 'fall': Enter from top (falling down) - used when navigating DOWN the sidebar
 * - 'rise': Enter from bottom (rising up) - used when navigating UP the sidebar
 * - 'fall': Fallback for unknown routes (default to falling)
 * 
 * @param fromPath - The source route pathname (can be null for initial load)
 * @param toPath - The destination route pathname
 * @param orderedItems - The current sidebar order
 */
export function getEntryDirection(
  fromPath: string | null,
  toPath: string,
  orderedItems: string[]
): 'fall' | 'rise' {
  // Initial load or no previous path - default to fall
  if (!fromPath) {
    return 'fall';
  }
  
  const comparison = compareRoutes(fromPath, toPath, orderedItems);
  
  switch (comparison.direction) {
    case 'down':
      // Moving to a page BELOW in sidebar -> enter from TOP (falling)
      return 'fall';
    case 'up':
      // Moving to a page ABOVE in sidebar -> enter from BOTTOM (rising)
      return 'rise';
    case 'same':
      // Same page - shouldn't happen but default to fall
      return 'fall';
    case 'unknown':
      // Unknown routes - default to fall
      return 'fall';
  }
}
