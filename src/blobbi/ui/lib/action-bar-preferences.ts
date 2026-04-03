/**
 * Action Bar Preferences
 *
 * Lightweight localStorage-backed model controlling which items are
 * visible in the BlobbiBottomBar and in which order.
 *
 * Fixed items (cannot be hidden or reordered by the user):
 *   - Main Action (center button) -- always present
 *   - More (right-most button)   -- always present
 *
 * Customizable items (up to 3 visible slots):
 *   Candidates: Blobbies, Missions, Items, Take Photo, Set as Companion
 *
 * Persistence: localStorage only for now. Shape is designed so it can
 * later migrate to a Nostr event tag.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

/** Identifiers for customizable bottom-bar items */
export type BarItemId =
  | 'blobbies'
  | 'missions'
  | 'items'
  | 'take_photo'
  | 'set_companion';

/** A single customizable bar slot */
export interface BarItemSlot {
  id: BarItemId;
  visible: boolean;
  /** If true, this item receives a subtle highlight ring in the bar */
  highlighted?: boolean;
}

/** Full persisted preference shape */
export interface ActionBarPreferences {
  /** Ordered list of customizable items. Visible items render in array order. */
  slots: BarItemSlot[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Max visible customizable items (Main Action + More are fixed) */
export const MAX_VISIBLE_SLOTS = 3;

/** localStorage key for bar slot preferences */
export const STORAGE_KEY = 'blobbi:action-bar-prefs';

/** localStorage key for inline mission surface card visibility */
export const MISSION_CARD_STORAGE_KEY = 'blobbi:mission-card-visible';

/** Human-readable labels */
export const BAR_ITEM_LABELS: Record<BarItemId, string> = {
  blobbies: 'Blobbies',
  missions: 'Missions',
  items: 'Items',
  take_photo: 'Take Photo',
  set_companion: 'Companion',
};

/** Default preferences: only Blobbies visible, others hidden */
export const DEFAULT_PREFERENCES: ActionBarPreferences = {
  slots: [
    { id: 'blobbies', visible: true },
    { id: 'missions', visible: false },
    { id: 'items', visible: false },
    { id: 'take_photo', visible: false },
    { id: 'set_companion', visible: false },
  ],
};

// ─── Utilities ────────────────────────────────────────────────────────────────

/** Return only visible slots, in order */
export function getVisibleSlots(prefs: ActionBarPreferences): BarItemSlot[] {
  return prefs.slots.filter((s) => s.visible);
}

/** Count of currently visible custom items */
export function visibleCount(prefs: ActionBarPreferences): number {
  return prefs.slots.filter((s) => s.visible).length;
}

/** Can we show one more item? */
export function canShowMore(prefs: ActionBarPreferences): boolean {
  return visibleCount(prefs) < MAX_VISIBLE_SLOTS;
}

/** Toggle visibility of a slot. Enforces MAX_VISIBLE_SLOTS. */
export function toggleSlotVisibility(
  prefs: ActionBarPreferences,
  id: BarItemId,
): ActionBarPreferences {
  const slot = prefs.slots.find((s) => s.id === id);
  if (!slot) return prefs;

  // If turning ON and already at max, reject
  if (!slot.visible && !canShowMore(prefs)) return prefs;

  return {
    slots: prefs.slots.map((s) =>
      s.id === id ? { ...s, visible: !s.visible } : s,
    ),
  };
}

/** Toggle highlight on a slot (only one can be highlighted at a time) */
export function toggleSlotHighlight(
  prefs: ActionBarPreferences,
  id: BarItemId,
): ActionBarPreferences {
  return {
    slots: prefs.slots.map((s) =>
      s.id === id
        ? { ...s, highlighted: !s.highlighted }
        : { ...s, highlighted: false },
    ),
  };
}

/** Move a slot up (earlier) in the list */
export function moveSlotUp(
  prefs: ActionBarPreferences,
  id: BarItemId,
): ActionBarPreferences {
  const idx = prefs.slots.findIndex((s) => s.id === id);
  if (idx <= 0) return prefs;
  const newSlots = [...prefs.slots];
  [newSlots[idx - 1], newSlots[idx]] = [newSlots[idx], newSlots[idx - 1]];
  return { slots: newSlots };
}

/** Move a slot down (later) in the list */
export function moveSlotDown(
  prefs: ActionBarPreferences,
  id: BarItemId,
): ActionBarPreferences {
  const idx = prefs.slots.findIndex((s) => s.id === id);
  if (idx < 0 || idx >= prefs.slots.length - 1) return prefs;
  const newSlots = [...prefs.slots];
  [newSlots[idx], newSlots[idx + 1]] = [newSlots[idx + 1], newSlots[idx]];
  return { slots: newSlots };
}

/**
 * Validate and repair preferences loaded from localStorage.
 * Adds missing candidates, removes unknown ids, preserves order.
 */
export function validatePreferences(raw: unknown): ActionBarPreferences {
  if (!raw || typeof raw !== 'object' || !('slots' in raw)) {
    return DEFAULT_PREFERENCES;
  }

  const obj = raw as { slots: unknown };
  if (!Array.isArray(obj.slots)) return DEFAULT_PREFERENCES;

  const knownIds = new Set<BarItemId>(DEFAULT_PREFERENCES.slots.map((s) => s.id));
  const seenIds = new Set<BarItemId>();

  // Keep valid existing entries
  const cleaned: BarItemSlot[] = [];
  for (const item of obj.slots) {
    if (
      item &&
      typeof item === 'object' &&
      'id' in item &&
      typeof (item as BarItemSlot).id === 'string' &&
      knownIds.has((item as BarItemSlot).id) &&
      !seenIds.has((item as BarItemSlot).id)
    ) {
      const slot = item as BarItemSlot;
      seenIds.add(slot.id);
      cleaned.push({
        id: slot.id,
        visible: typeof slot.visible === 'boolean' ? slot.visible : false,
        highlighted: typeof slot.highlighted === 'boolean' ? slot.highlighted : false,
      });
    }
  }

  // Add any missing candidates (new features added after user saved prefs)
  for (const def of DEFAULT_PREFERENCES.slots) {
    if (!seenIds.has(def.id)) {
      cleaned.push({ ...def });
    }
  }

  return { slots: cleaned };
}

/**
 * Load preferences from localStorage with validation.
 */
export function loadPreferences(): ActionBarPreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFERENCES;
    return validatePreferences(JSON.parse(raw));
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

/**
 * Save preferences to localStorage.
 */
export function savePreferences(prefs: ActionBarPreferences): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Silently fail (quota, SSR, etc.)
  }
}

// ─── Mission Surface Card Visibility ──────────────────────────────────────────

/**
 * Load the inline mission card visibility preference.
 * Defaults to `true` (visible).
 */
export function loadMissionCardVisible(): boolean {
  try {
    const raw = localStorage.getItem(MISSION_CARD_STORAGE_KEY);
    if (raw === null) return true;
    return raw === 'true';
  } catch {
    return true;
  }
}

/**
 * Save the inline mission card visibility preference.
 */
export function saveMissionCardVisible(visible: boolean): void {
  try {
    localStorage.setItem(MISSION_CARD_STORAGE_KEY, String(visible));
  } catch {
    // Silently fail
  }
}

// ─── Visible-in-bar Set Helper ────────────────────────────────────────────────

/**
 * Return the set of BarItemIds currently visible in the bottom bar.
 * Used by the More dropdown to skip items that are already in the bar.
 */
export function getVisibleBarIds(prefs: ActionBarPreferences): Set<BarItemId> {
  return new Set(prefs.slots.filter((s) => s.visible).map((s) => s.id));
}
