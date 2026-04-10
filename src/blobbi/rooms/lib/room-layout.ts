// src/blobbi/rooms/lib/room-layout.ts

/**
 * Shared layout constants for Blobbi room components.
 */

/**
 * CSS class for the bottom action bar in every room.
 *
 * On mobile/tablet (max-sidebar), adds extra bottom padding so the
 * room controls clear the app's fixed bottom navigation bar.
 * On desktop (sidebar:), uses normal padding since there's no bottom nav.
 */
export const ROOM_BOTTOM_BAR_CLASS =
  'relative z-10 px-3 sm:px-6 pt-1 pb-4 sm:pb-6 max-sidebar:pb-[calc(var(--bottom-nav-height)+env(safe-area-inset-bottom,0px)+1rem)]';
