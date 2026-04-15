/**
 * Shared layout constants for Blobbi room components.
 */

/**
 * CSS class for the bottom action bar in every room.
 *
 * On mobile (max-sidebar), adds extra bottom padding to clear the
 * fixed bottom navigation bar. On desktop (sidebar:), uses normal padding.
 */
export const ROOM_BOTTOM_BAR_CLASS =
  'relative z-10 px-3 sm:px-6 pt-1 pb-4 sm:pb-6 max-sidebar:pb-[calc(var(--bottom-nav-height)+env(safe-area-inset-bottom,0px)+1rem)]';
